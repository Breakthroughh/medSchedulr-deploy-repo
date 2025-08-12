import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const posts = await prisma.post_configs.findMany({
      orderBy: {
        name: 'asc'
      }
    })

    return NextResponse.json({ posts })
  } catch (error) {
    console.error('Error fetching posts:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name, type } = await request.json()

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: "Post name is required" }, { status: 400 })
    }

    if (!type || !['WEEKDAY', 'WEEKEND', 'BOTH'].includes(type)) {
      return NextResponse.json({ error: "Valid post type is required" }, { status: 400 })
    }

    // Check if post name already exists
    const existingPost = await prisma.post_configs.findFirst({
      where: {
        name: name.trim()
      }
    })

    if (existingPost) {
      return NextResponse.json({ error: "Post name already exists" }, { status: 400 })
    }

    const post = await prisma.post_configs.create({
      data: {
        id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name.trim(),
        type,
        updatedAt: new Date()
      }
    })

    // Generate availability records for all doctors in all roster periods
    const rosterPeriods = await prisma.rosterPeriod.findMany()

    const doctors = await prisma.doctors.findMany({
      where: { active: true }
    })

    // Get approved unavailability requests
    const unavailabilityRequests = await prisma.availability_requests.findMany({
      where: { status: 'APPROVED' }
    })

    let totalCreated = 0

    for (const rosterPeriod of rosterPeriods) {
      // Generate date range for this period
      const dates = []
      let currentDate = new Date(rosterPeriod.startDate)
      const endDate = new Date(rosterPeriod.endDate)
      
      while (currentDate <= endDate) {
        dates.push(new Date(currentDate))
        currentDate.setDate(currentDate.getDate() + 1)
      }

      // Create availability records for each doctor for this new post
      for (const doctor of doctors) {
        for (const date of dates) {
          // Check if availability record already exists
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

            await prisma.availability.create({
              data: {
                id: `avail_post_${post.id}_${doctor.id}_${date.getTime()}`,
                doctorId: doctor.id,
                rosterPeriodId: rosterPeriod.id,
                postConfigId: post.id,
                date: date,
                available: !hasUnavailabilityRequest, // Available unless blocked by request
                status: 'REQUESTED'
              }
            })
            totalCreated++
          }
        }
      }
    }

    console.log(`✅ Created ${totalCreated} availability records for new post: ${post.name}`)

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "CREATE",
        resource: "PostConfig",
        resourceId: post.id,
        details: { 
          name: post.name, 
          type: post.type,
          availabilityRecordsCreated: totalCreated,
          rosterPeriodsAffected: rosterPeriods.length
        }
      }
    })

    return NextResponse.json({ 
      post,
      availabilityRecordsCreated: totalCreated,
      message: `Post created with ${totalCreated} availability records`
    })
  } catch (error) {
    console.error('Error creating post:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}