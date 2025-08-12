import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Python API configuration
const PYTHON_API_BASE = process.env.PYTHON_API_BASE_URL || 'http://localhost:8000'

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

    // Get roster period details
    const rosterPeriod = await prisma.rosterPeriod.findUnique({
      where: { id: rosterPeriodId }
    })

    if (!rosterPeriod) {
      return NextResponse.json({ error: "Roster period not found" }, { status: 404 })
    }

    // Get all doctors with their units and availability
    const doctors = await prisma.doctors.findMany({
      include: {
        units: true,
        availability: {
          where: {
            date: {
              gte: rosterPeriod.startDate,
              lte: rosterPeriod.endDate
            }
          },
          include: {
            post_configs: true
          }
        }
      }
    })

    // Get all units with clinic days
    const units = await prisma.unit.findMany({
      include: {
        clinic_days: true
      }
    })

    // Get posts configuration
    const posts = await prisma.post_configs.findMany({ where: { active: true } })
    const postsWeekday = posts.filter(p => p.type === 'WEEKDAY' || p.type === 'BOTH').map(p => p.name)
    const postsWeekend = posts.filter(p => p.type === 'WEEKEND' || p.type === 'BOTH').map(p => p.name)

    // Get solver configuration
    const solverConfig = await prisma.solver_configs.findFirst({
      where: { active: true },
      orderBy: { updatedAt: 'desc' }
    })

    if (!solverConfig) {
      return NextResponse.json({ error: "No active solver configuration found" }, { status: 404 })
    }

    // Get approved unavailability requests for this period
    const unavailabilityRequests = await prisma.availability_requests.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: rosterPeriod.endDate },
        endDate: { gte: rosterPeriod.startDate }
      }
    })

    // Prepare availability data with unavailability requests applied
    const availabilityData = doctors.flatMap(doctor =>
      doctor.availability.map(avail => {
        const date = new Date(avail.date)
        
        // Check if doctor has approved unavailability request for this date/post
        const hasUnavailabilityRequest = unavailabilityRequests.some(req => 
          req.doctorId === doctor.id &&
          date >= new Date(req.startDate) &&
          date <= new Date(req.endDate) &&
          (req.type === 'LEAVE' || 
           req.type === 'UNAVAILABLE' || 
           (req.type === 'BLOCK_ONCALL' && 
            (avail.post_configs.name.toLowerCase().includes('call') || 
             avail.post_configs.name.toLowerCase().includes('standby'))))
        )

        return {
          doctor_id: doctor.id,
          date: avail.date.toISOString().split('T')[0],
          post: avail.post_configs.name,
          available: avail.available && !hasUnavailabilityRequest // Apply unavailability requests
        }
      })
    )

    // Prepare data for Python API
    const scheduleRequest = {
      roster_start: rosterPeriod.startDate.toISOString().split('T')[0],
      roster_end: rosterPeriod.endDate.toISOString().split('T')[0],
      doctors: doctors.map(doctor => ({
        id: doctor.id,
        name: doctor.displayName,
        unit: doctor.units.name,
        category: doctor.category.toLowerCase(),
        last_standby: doctor.lastStandby?.toISOString().split('T')[0] || "1900-01-01", // Default very old date if null
        workload: {
          weekday: doctor.workloadWeekday || 0,
          weekend: doctor.workloadWeekend || 0,
          ED: doctor.workloadED || 0
        }
      })),
      units: units.map(unit => ({
        id: unit.id,
        name: unit.name,
        clinic_days: unit.clinic_days.map(cd => cd.weekday)
      })),
      posts_weekday: postsWeekday,
      posts_weekend: postsWeekend,
      availability: availabilityData,
      solver_config: {
        lambdaRest: solverConfig.lambdaRest,
        lambdaGap: solverConfig.lambdaGap,
        lambdaED: solverConfig.lambdaED,
        lambdaStandby: solverConfig.lambdaStandby,
        lambdaMinOne: solverConfig.lambdaMinOne,
        lambdaRegWeekend: solverConfig.lambdaRegWeekend,
        lambdaUnitOver: solverConfig.lambdaUnitOver,
        lambdaJuniorWard: solverConfig.lambdaJuniorWard,
        clinicPenaltyBefore: solverConfig.clinicPenaltyBefore,
        clinicPenaltySame: solverConfig.clinicPenaltySame,
        clinicPenaltyAfter: solverConfig.clinicPenaltyAfter,
        bigM: solverConfig.bigM,
        solverTimeoutSeconds: solverConfig.solverTimeoutSeconds
      }
    }

    console.log(`🚀 Starting schedule generation for roster period ${rosterPeriodId}`)
    console.log(`📊 Data: ${doctors.length} doctors, ${units.length} units, ${scheduleRequest.availability.length} availability records`)
    
    // Debug: Log post availability breakdown
    const postAvailabilityBreakdown = scheduleRequest.availability.reduce((acc, avail) => {
      if (!acc[avail.post]) acc[avail.post] = 0
      acc[avail.post]++
      return acc
    }, {} as Record<string, number>)
    
    console.log('📋 Post availability breakdown:', postAvailabilityBreakdown)
    console.log('📋 Posts Weekday:', postsWeekday)
    console.log('📋 Posts Weekend:', postsWeekend)
    
    // Debug: Log Standby Oncall availability specifically
    const standbyOncallAvailability = scheduleRequest.availability.filter(avail => 
      avail.post === 'Standby Oncall'
    )
    console.log(`📋 Standby Oncall availability: ${standbyOncallAvailability.length} records`)
    console.log(`📋 Standby Oncall available: ${standbyOncallAvailability.filter(a => a.available).length} records`)
    
    // Debug: Log weekend Standby Oncall availability
    const weekendStandbyAvailability = standbyOncallAvailability.filter(avail => {
      const date = new Date(avail.date)
      return date.getDay() === 0 || date.getDay() === 6 // Sunday or Saturday
    })
    console.log(`📋 Weekend Standby Oncall availability: ${weekendStandbyAvailability.length} records`)
    console.log(`📋 Weekend Standby Oncall available: ${weekendStandbyAvailability.filter(a => a.available).length} records`)
    
    // Debug: Log doctor lastStandby values
    const doctorStandbyInfo = scheduleRequest.doctors.map(d => ({
      name: d.name,
      lastStandby: d.last_standby,
      category: d.category
    }))
    console.log('📋 Doctor Standby Info:', JSON.stringify(doctorStandbyInfo, null, 2))
    
    // Log Standby Oncall specific data for debugging
    console.log('🎯 STANDBY ONCALL DEBUG:')
    console.log(`  - Is "Standby Oncall" in posts_weekend? ${postsWeekend.includes('Standby Oncall')}`)
    console.log(`  - Posts weekend array:`, postsWeekend)
    console.log(`  - Standby availability count: ${standbyOncallAvailability.length}`)
    console.log(`  - Weekend Standby availability count: ${weekendStandbyAvailability.length}`)
    
    console.log('📋 Schedule request data:', JSON.stringify(scheduleRequest, null, 2))

    // Call Python API
    const pythonResponse = await fetch(`${PYTHON_API_BASE}/schedule/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scheduleRequest)
    })

    if (!pythonResponse.ok) {
      const error = await pythonResponse.text()
      console.error('❌ Python API error:', error)
      console.error(`❌ Status: ${pythonResponse.status} ${pythonResponse.statusText}`)
      return NextResponse.json({ error: "Schedule generation failed" }, { status: 500 })
    }

    const result = await pythonResponse.json()
    console.log('🐍 Python API Response:', JSON.stringify(result, null, 2))
    
    // Create schedule generation record
    const scheduleGeneration = await prisma.schedule_generations.create({
      data: {
        id: `sched_gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        rosterPeriodId,
        jobId: result.job_id,
        status: 'PENDING',
        requestedById: session.user.id,
        solverConfigId: solverConfig.id,
        updatedAt: new Date()
      }
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "CREATE",
        resource: "ScheduleGeneration",
        resourceId: scheduleGeneration.id,
        details: {
          rosterPeriodId,
          jobId: result.job_id,
          doctorCount: doctors.length,
          unitCount: units.length
        }
      }
    })

    return NextResponse.json({
      scheduleGenerationId: scheduleGeneration.id,
      jobId: result.job_id,
      status: result.status,
      message: result.message
    })

  } catch (error) {
    console.error('Error generating schedule:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}