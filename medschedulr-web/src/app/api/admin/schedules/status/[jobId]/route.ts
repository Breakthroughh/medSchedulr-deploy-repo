import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const PYTHON_API_BASE = process.env.PYTHON_API_URL || 'http://localhost:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { jobId } = await params

    // Find the schedule generation record
    const scheduleGeneration = await prisma.scheduleGeneration.findUnique({
      where: { jobId },
      include: {
        rosterPeriod: true,
        requestedBy: {
          select: { email: true }
        }
      }
    })

    if (!scheduleGeneration) {
      return NextResponse.json({ error: "Schedule generation not found" }, { status: 404 })
    }

    // Check status from Python API
    const pythonResponse = await fetch(`${PYTHON_API_BASE}/schedule/status/${jobId}`)
    
    if (!pythonResponse.ok) {
      console.error(`Failed to get status for job ${jobId}`)
      return NextResponse.json({ error: "Failed to get job status" }, { status: 500 })
    }

    const pythonResult = await pythonResponse.json()
    
    // Update our database record based on Python API status
    let updatedStatus = scheduleGeneration.status
    if (pythonResult.status === 'completed' && scheduleGeneration.status !== 'COMPLETED') {
      updatedStatus = 'COMPLETED'
      
      // Save the schedule results to database
      if (pythonResult.result && pythonResult.result.success) {
        const schedule = pythonResult.result.schedule
        
        // Clear existing schedule for this roster period
        await prisma.scheduleAssignment.deleteMany({
          where: { rosterPeriodId: scheduleGeneration.rosterPeriodId }
        })
        
        // Create new schedule assignments
        const assignments = schedule.map((assignment: any) => ({
          rosterPeriodId: scheduleGeneration.rosterPeriodId,
          doctorId: assignment.doctor,
          date: new Date(assignment.date),
          postName: assignment.post,
          scheduleGenerationId: scheduleGeneration.id
        }))
        
        await prisma.scheduleAssignment.createMany({
          data: assignments
        })
        
        console.log(`✅ Saved ${assignments.length} schedule assignments for roster period ${scheduleGeneration.rosterPeriodId}`)
      }
      
      // Update schedule generation record
      await prisma.scheduleGeneration.update({
        where: { id: scheduleGeneration.id },
        data: {
          status: updatedStatus,
          completedAt: new Date(),
          result: pythonResult.result
        }
      })
      
    } else if (pythonResult.status === 'failed' && scheduleGeneration.status !== 'FAILED') {
      updatedStatus = 'FAILED'
      
      await prisma.scheduleGeneration.update({
        where: { id: scheduleGeneration.id },
        data: {
          status: updatedStatus,
          error: pythonResult.error || 'Unknown error',
          completedAt: new Date()
        }
      })
    }

    return NextResponse.json({
      scheduleGenerationId: scheduleGeneration.id,
      jobId: scheduleGeneration.jobId,
      status: updatedStatus,
      progress: pythonResult.progress || 0,
      rosterPeriod: {
        id: scheduleGeneration.rosterPeriod.id,
        name: scheduleGeneration.rosterPeriod.name,
        startDate: scheduleGeneration.rosterPeriod.startDate,
        endDate: scheduleGeneration.rosterPeriod.endDate
      },
      requestedBy: scheduleGeneration.requestedBy,
      createdAt: scheduleGeneration.createdAt,
      completedAt: scheduleGeneration.completedAt,
      result: pythonResult.result,
      error: pythonResult.error || scheduleGeneration.error
    })

  } catch (error) {
    console.error('Error checking schedule status:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}