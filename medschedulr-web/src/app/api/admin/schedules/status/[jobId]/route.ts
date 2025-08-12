import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const PYTHON_API_BASE = process.env.PYTHON_API_BASE_URL || 'http://localhost:8000'

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
    const scheduleGeneration = await prisma.schedule_generations.findUnique({
      where: { jobId },
      include: {
        roster_periods: true,
        users: {
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
        
        console.log('🐍 PYTHON API RESULT DEBUG:')
        console.log(`  - Total assignments returned: ${schedule.length}`)
        
        // Count assignments by post
        const postCounts = schedule.reduce((acc: any, assignment: any) => {
          acc[assignment.post] = (acc[assignment.post] || 0) + 1
          return acc
        }, {})
        console.log('  - Assignments by post:', JSON.stringify(postCounts, null, 2))
        
        // Check specifically for Standby Oncall
        const standbyAssignments = schedule.filter((a: any) => a.post === 'Standby Oncall')
        console.log(`  - Standby Oncall assignments from Python: ${standbyAssignments.length}`)
        if (standbyAssignments.length > 0) {
          console.log('  - Standby Oncall details:', JSON.stringify(standbyAssignments, null, 2))
        }
        
        // Clear existing schedule for this roster period
        await prisma.schedule_assignments.deleteMany({
          where: { rosterPeriodId: scheduleGeneration.rosterPeriodId }
        })
        
        // Create new schedule assignments with Standby Oncall post-processing
        let assignments = schedule.map((assignment: any) => ({
          id: `assign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          rosterPeriodId: scheduleGeneration.rosterPeriodId,
          doctorId: assignment.doctor,
          date: new Date(assignment.date),
          postName: assignment.post,
          scheduleGenerationId: scheduleGeneration.id
        }))
        
        // Post-process Standby Oncall assignments to ensure same doctor for Sat+Sun
        const standbyOncallAssignments = assignments.filter(a => a.postName === 'Standby Oncall')
        if (standbyOncallAssignments.length > 0) {
          console.log(`🎯 Post-processing ${standbyOncallAssignments.length} Standby Oncall assignments`)
          
          // Group by weekend pairs (Saturday + Sunday)
          const weekendGroups = new Map<string, typeof assignments>()
          
          standbyOncallAssignments.forEach(assignment => {
            const date = new Date(assignment.date)
            const weekday = date.getDay()
            
            if (weekday === 6 || weekday === 0) { // Saturday or Sunday
              // Get the Saturday date for this weekend
              const saturday = new Date(date)
              if (weekday === 0) { // If Sunday, get previous Saturday
                saturday.setDate(saturday.getDate() - 1)
              }
              const weekendKey = saturday.toISOString().split('T')[0]
              
              if (!weekendGroups.has(weekendKey)) {
                weekendGroups.set(weekendKey, [])
              }
              weekendGroups.get(weekendKey)!.push(assignment)
            }
          })
          
          // For each weekend, make sure Saturday doctor also works Sunday
          weekendGroups.forEach((weekendAssignments, weekendKey) => {
            const saturdayAssignment = weekendAssignments.find(a => new Date(a.date).getDay() === 6)
            const sundayAssignment = weekendAssignments.find(a => new Date(a.date).getDay() === 0)
            
            if (saturdayAssignment && sundayAssignment && saturdayAssignment.doctorId !== sundayAssignment.doctorId) {
              console.log(`🔄 Weekend ${weekendKey}: Changing Sunday doctor from ${sundayAssignment.doctorId} to ${saturdayAssignment.doctorId}`)
              
              // Update the Sunday assignment to use the Saturday doctor
              const assignmentIndex = assignments.findIndex(a => 
                a.id === sundayAssignment.id
              )
              if (assignmentIndex !== -1) {
                assignments[assignmentIndex].doctorId = saturdayAssignment.doctorId
              }
            }
          })
        }
        
        // Final logging before database save
        const finalPostCounts = assignments.reduce((acc: any, assignment: any) => {
          acc[assignment.postName] = (acc[assignment.postName] || 0) + 1
          return acc
        }, {})
        console.log('💾 FINAL ASSIGNMENTS TO SAVE:', JSON.stringify(finalPostCounts, null, 2))
        
        const finalStandbyCount = assignments.filter(a => a.postName === 'Standby Oncall').length
        console.log(`💾 Final Standby Oncall assignments to save: ${finalStandbyCount}`)
        
        await prisma.schedule_assignments.createMany({
          data: assignments
        })
        
        console.log(`✅ Saved ${assignments.length} schedule assignments for roster period ${scheduleGeneration.rosterPeriodId}`)
      }
      
      // Update schedule generation record
      await prisma.schedule_generations.update({
        where: { id: scheduleGeneration.id },
        data: {
          status: updatedStatus,
          completedAt: new Date(),
          result: pythonResult.result
        }
      })
      
    } else if (pythonResult.status === 'failed' && scheduleGeneration.status !== 'FAILED') {
      updatedStatus = 'FAILED'
      
      await prisma.schedule_generations.update({
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
        id: scheduleGeneration.roster_periods.id,
        name: scheduleGeneration.roster_periods.name,
        startDate: scheduleGeneration.roster_periods.startDate,
        endDate: scheduleGeneration.roster_periods.endDate
      },
      requestedBy: scheduleGeneration.users,
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