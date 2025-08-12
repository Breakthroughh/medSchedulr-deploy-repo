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

    const periods = await prisma.rosterPeriod.findMany({
      include: {
        schedule_generations: {
          where: {
            status: 'COMPLETED'
          },
          select: {
            id: true,
            completedAt: true,
            status: true
          },
          orderBy: {
            completedAt: 'desc'
          },
          take: 1
        },
        _count: {
          select: {
            schedule_generations: {
              where: {
                status: 'COMPLETED'
              }
            },
            schedule_assignments: true
          }
        }
      },
      orderBy: {
        startDate: 'desc'
      }
    })

    return NextResponse.json({ periods })
  } catch (error) {
    console.error('Error fetching roster periods:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name, startDate, endDate } = await request.json()

    // Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: "Period name is required" }, { status: 400 })
    }

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Start and end dates are required" }, { status: 400 })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    if (start >= end) {
      return NextResponse.json({ error: "Start date must be before end date" }, { status: 400 })
    }

    if (start < new Date()) {
      return NextResponse.json({ error: "Start date cannot be in the past" }, { status: 400 })
    }

    // Check for overlapping periods
    const overlapping = await prisma.rosterPeriod.findFirst({
      where: {
        OR: [
          {
            startDate: { lte: end },
            endDate: { gte: start }
          }
        ]
      }
    })

    if (overlapping) {
      return NextResponse.json({ 
        error: "This period overlaps with an existing roster period" 
      }, { status: 400 })
    }

    // Create the roster period
    const period = await prisma.rosterPeriod.create({
      data: {
        name: name.trim(),
        startDate: start,
        endDate: end,
        status: 'DRAFT'
      }
    })

    // Generate ALL availability slots for this roster period (doctor × date × post = available: true)
    const doctors = await prisma.doctors.findMany({
      where: { active: true }
    })

    const posts = await prisma.post_configs.findMany({
      where: { active: true }
    })

    // Generate date range
    const dates = []
    let currentDate = new Date(start)
    const periodEndDate = new Date(end)
    
    while (currentDate <= periodEndDate) {
      dates.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }

    console.log(`🔄 Creating availability matrix for ${doctors.length} doctors × ${dates.length} dates × ${posts.length} posts (respecting post type scheduling)`)

    // Create availability slots: DEFAULT to available: true, but respect post type scheduling
    const availabilitySlots = []
    for (const doctor of doctors) {
      for (const date of dates) {
        const isWeekend = date.getDay() === 0 || date.getDay() === 6 // Sunday = 0, Saturday = 6
        
        for (const post of posts) {
          // Only create availability slots for appropriate days based on post type
          const shouldCreateSlot = 
            post.type === 'BOTH' || // BOTH: create for all days
            (post.type === 'WEEKDAY' && !isWeekend) || // WEEKDAY: only weekdays  
            (post.type === 'WEEKEND' && isWeekend) // WEEKEND: only weekends
          
          if (shouldCreateSlot) {
            availabilitySlots.push({
              id: `avail_${period.id}_${doctor.id}_${post.id}_${date.getTime()}`,
              doctorId: doctor.id,
              rosterPeriodId: period.id,
              postConfigId: post.id,
              date: date,
              available: true, // DEFAULT: All slots available
              status: 'REQUESTED'
            })
          }
        }
      }
    }

    console.log(`📝 Preparing to create ${availabilitySlots.length} availability slots...`)

    // Debug: Log breakdown by post type
    const postBreakdown = availabilitySlots.reduce((acc, slot) => {
      const post = posts.find(p => p.id === slot.postConfigId)
      const postName = post ? post.name : 'Unknown'
      if (!acc[postName]) acc[postName] = 0
      acc[postName]++
      return acc
    }, {} as Record<string, number>)
    
    console.log('📋 Availability slots by post:', postBreakdown)

    // Batch create all availability slots
    const result = await prisma.availability.createMany({
      data: availabilitySlots,
      skipDuplicates: true // Skip if any exist (shouldn't happen but safer)
    })

    console.log(`✅ Created ${result.count} availability slots for roster period: ${period.name}`)

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "CREATE",
        resource: "RosterPeriod",
        resourceId: period.id,
        details: {
          name: period.name,
          startDate,
          endDate
        }
      }
    })

    return NextResponse.json({ period })
  } catch (error) {
    console.error('Error creating roster period:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}