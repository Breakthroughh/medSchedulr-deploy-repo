import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { format, isWeekend } from "date-fns"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get latest roster period
    const rosterPeriod = await prisma.rosterPeriod.findFirst({
      orderBy: { createdAt: 'desc' }
    })

    if (!rosterPeriod) {
      return NextResponse.json({ error: "No roster periods found" }, { status: 404 })
    }

    // Get all posts
    const posts = await prisma.post_configs.findMany({
      where: { active: true }
    })

    // Get all doctors with availability for this roster period
    const doctors = await prisma.doctors.findMany({
      where: { active: true },
      include: {
        units: true,
        availability: {
          where: {
            rosterPeriodId: rosterPeriod.id
          },
          include: {
            post_configs: true
          }
        }
      }
    })

    // Focus on Standby Oncall post
    const standbyOncallPost = posts.find(p => p.name === 'Standby Oncall')
    
    if (!standbyOncallPost) {
      return NextResponse.json({ error: "Standby Oncall post not found" }, { status: 404 })
    }

    // Analyze Standby Oncall availability
    const standbyAnalysis = doctors.map(doctor => {
      const standbyAvailability = doctor.availability.filter(avail => 
        avail.post_configs.name === 'Standby Oncall'
      )

      const weekendStandbyAvailability = standbyAvailability.filter(avail => {
        const date = new Date(avail.date)
        return date.getDay() === 0 || date.getDay() === 6
      })

      return {
        doctor: {
          id: doctor.id,
          name: doctor.displayName,
          unit: doctor.units.name,
          category: doctor.category,
          lastStandby: doctor.lastStandby,
          workloadWeekday: doctor.workloadWeekday,
          workloadWeekend: doctor.workloadWeekend,
          workloadED: doctor.workloadED
        },
        standbyAvailability: {
          total: standbyAvailability.length,
          available: standbyAvailability.filter(a => a.available).length,
          unavailable: standbyAvailability.filter(a => !a.available).length,
          weekendTotal: weekendStandbyAvailability.length,
          weekendAvailable: weekendStandbyAvailability.filter(a => a.available).length,
          weekendUnavailable: weekendStandbyAvailability.filter(a => !a.available).length,
          dates: standbyAvailability.map(a => ({
            date: a.date.toISOString().split('T')[0],
            available: a.available,
            isWeekend: isWeekend(a.date)
          }))
        }
      }
    })

    // Get existing assignments for this roster period
    const assignments = await prisma.schedule_assignments.findMany({
      where: { rosterPeriodId: rosterPeriod.id },
      include: {
        doctors: true
      }
    })

    const standbyAssignments = assignments.filter(a => a.postName === 'Standby Oncall')

    // Check unavailability requests
    const unavailabilityRequests = await prisma.availability_requests.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: rosterPeriod.endDate },
        endDate: { gte: rosterPeriod.startDate }
      }
    })

    const standbyBlockingRequests = unavailabilityRequests.filter(req =>
      req.type === 'BLOCK_ONCALL'
    )

    return NextResponse.json({
      rosterPeriod: {
        id: rosterPeriod.id,
        name: rosterPeriod.name,
        startDate: rosterPeriod.startDate,
        endDate: rosterPeriod.endDate
      },
      standbyOncallPost: {
        id: standbyOncallPost.id,
        name: standbyOncallPost.name,
        type: standbyOncallPost.type,
        active: standbyOncallPost.active
      },
      doctorAnalysis: standbyAnalysis,
      existingStandbyAssignments: standbyAssignments.map(a => ({
        id: a.id,
        date: a.date,
        doctorName: a.doctors.displayName,
        postName: a.postName
      })),
      blockingRequests: standbyBlockingRequests.map(req => ({
        id: req.id,
        doctorId: req.doctorId,
        startDate: req.startDate,
        endDate: req.endDate,
        type: req.type,
        reason: req.reason
      })),
      summary: {
        totalDoctors: doctors.length,
        doctorsWithStandbyAvailability: standbyAnalysis.filter(a => a.standbyAvailability.total > 0).length,
        doctorsWithWeekendStandbyAvailability: standbyAnalysis.filter(a => a.standbyAvailability.weekendAvailable > 0).length,
        totalStandbySlots: standbyAnalysis.reduce((sum, a) => sum + a.standbyAvailability.total, 0),
        totalAvailableStandbySlots: standbyAnalysis.reduce((sum, a) => sum + a.standbyAvailability.available, 0),
        totalWeekendStandbySlots: standbyAnalysis.reduce((sum, a) => sum + a.standbyAvailability.weekendTotal, 0),
        totalAvailableWeekendStandbySlots: standbyAnalysis.reduce((sum, a) => sum + a.standbyAvailability.weekendAvailable, 0),
        existingStandbyAssignments: standbyAssignments.length,
        blockingRequests: standbyBlockingRequests.length
      }
    })

  } catch (error) {
    console.error('Standby analysis error:', error)
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 })
  }
}