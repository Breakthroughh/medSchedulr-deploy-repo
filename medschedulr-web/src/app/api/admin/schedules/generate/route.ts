import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Python API configuration
const PYTHON_API_BASE = process.env.PYTHON_API_URL || 'http://localhost:8000'

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
        unit: true,
        availability: {
          where: {
            date: {
              gte: rosterPeriod.startDate,
              lte: rosterPeriod.endDate
            }
          },
          include: {
            postConfig: true
          }
        }
      }
    })

    // Get all units with clinic days
    const units = await prisma.unit.findMany({
      include: {
        clinicDays: true
      }
    })

    // Get posts configuration
    const posts = await prisma.postConfig.findMany({ where: { active: true } })
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

    // Prepare data for Python API
    const scheduleRequest = {
      roster_start: rosterPeriod.startDate.toISOString().split('T')[0],
      roster_end: rosterPeriod.endDate.toISOString().split('T')[0],
      doctors: doctors.map(doctor => ({
        id: doctor.id,
        name: doctor.displayName,
        unit: doctor.unit.name,
        category: doctor.category.toLowerCase(),
        last_standby: doctor.lastStandby?.toISOString().split('T')[0] || null,
        workload: {
          weekday: doctor.workloadWeekday || 0,
          weekend: doctor.workloadWeekend || 0,
          ED: doctor.workloadED || 0
        }
      })),
      units: units.map(unit => ({
        id: unit.id,
        name: unit.name,
        clinic_days: unit.clinicDays.map(cd => cd.weekday)
      })),
      posts_weekday: postsWeekday,
      posts_weekend: postsWeekend,
      availability: doctors.flatMap(doctor =>
        doctor.availability.map(avail => ({
          doctor_id: doctor.id,
          date: avail.date.toISOString().split('T')[0],
          post: avail.postConfig.name,
          available: avail.available
        }))
      ),
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
      console.error('Python API error:', error)
      return NextResponse.json({ error: "Schedule generation failed" }, { status: 500 })
    }

    const result = await pythonResponse.json()
    
    // Create schedule generation record
    const scheduleGeneration = await prisma.scheduleGeneration.create({
      data: {
        rosterPeriodId,
        jobId: result.job_id,
        status: 'PENDING',
        requestedById: session.user.id,
        solverConfigId: solverConfig.id
      }
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
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