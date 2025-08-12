import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { rosterPeriodId } = await request.json()

    if (!rosterPeriodId) {
      return NextResponse.json({ error: "Roster period ID is required" }, { status: 400 })
    }

    // Get roster period
    const rosterPeriod = await prisma.rosterPeriod.findUnique({
      where: { id: rosterPeriodId }
    })

    if (!rosterPeriod) {
      return NextResponse.json({ error: "Roster period not found" }, { status: 404 })
    }

    // Get all active doctors and posts
    const doctors = await prisma.doctors.findMany({
      where: { active: true }
    })

    const posts = await prisma.post_configs.findMany({
      where: { active: true }
    })

    console.log(`🔄 Generating missing availability for ${doctors.length} doctors and ${posts.length} posts`)

    // Generate date range for this period
    const dates = []
    let currentDate = new Date(rosterPeriod.startDate)
    const endDate = new Date(rosterPeriod.endDate)
    
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Get all approved unavailability requests for this period
    const unavailabilityRequests = await prisma.availability_requests.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: rosterPeriod.endDate },
        endDate: { gte: rosterPeriod.startDate }
      }
    })

    let createdCount = 0

    // Create missing availability records - DEFAULT ALL DOCTORS AS AVAILABLE
    for (const doctor of doctors) {
      for (const post of posts) {
        for (const date of dates) {
          // Check if availability record exists
          const existing = await prisma.availability.findUnique({
            where: {
              doctorId_rosterPeriodId_postConfigId_date: {
                doctorId: doctor.id,
                rosterPeriodId: rosterPeriod.id,
                postConfigId: post.id,
                date: date
              }
            }
          })

          if (!existing) {
            // Check if doctor has approved unavailability request for this date
            const hasUnavailabilityRequest = unavailabilityRequests.some(req => 
              req.doctorId === doctor.id &&
              date >= new Date(req.startDate) &&
              date <= new Date(req.endDate) &&
              (req.type === 'LEAVE' || 
               req.type === 'UNAVAILABLE' || 
               (req.type === 'BLOCK_ONCALL' && (post.name.toLowerCase().includes('call') || post.name.toLowerCase().includes('standby'))))
            )

            // Create availability record - DEFAULT TO AVAILABLE unless unavailability request exists
            await prisma.availability.create({
              data: {
                id: `avail_gen_${doctor.id}_${post.id}_${date.getTime()}`,
                doctorId: doctor.id,
                rosterPeriodId: rosterPeriod.id,
                postConfigId: post.id,
                date: date,
                available: !hasUnavailabilityRequest, // Available unless blocked by request
                status: 'REQUESTED'
              }
            })
            createdCount++
          }
        }
      }
    }

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "GENERATE",
        resource: "Availability",
        resourceId: rosterPeriod.id,
        details: {
          rosterPeriodName: rosterPeriod.name,
          createdRecords: createdCount,
          doctorCount: doctors.length,
          postCount: posts.length,
          dateCount: dates.length,
          unavailabilityRequestsApplied: unavailabilityRequests.length
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: `Generated ${createdCount} missing availability records`,
      details: {
        rosterPeriod: rosterPeriod.name,
        createdRecords: createdCount,
        doctors: doctors.length,
        posts: posts.length,
        dates: dates.length,
        unavailabilityRequestsApplied: unavailabilityRequests.length
      }
    })

  } catch (error) {
    console.error('Error generating missing availability:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}