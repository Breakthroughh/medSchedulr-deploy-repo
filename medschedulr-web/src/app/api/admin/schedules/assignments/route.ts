import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { assignmentId, doctorId, postName } = await request.json()

    if (!assignmentId) {
      return NextResponse.json({ error: "Assignment ID is required" }, { status: 400 })
    }

    // Update the assignment
    const updatedAssignment = await prisma.schedule_assignments.update({
      where: { id: assignmentId },
      data: {
        doctorId: doctorId,
        postName: postName
      },
      include: {
        doctors: true
      }
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "UPDATE",
        resource: "ScheduleAssignment",
        resourceId: assignmentId,
        details: {
          oldDoctorId: assignmentId, // Would need to track this properly
          newDoctorId: doctorId,
          newPostName: postName
        }
      }
    })

    return NextResponse.json({ 
      success: true, 
      assignment: updatedAssignment 
    })

  } catch (error) {
    console.error('Error updating assignment:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const assignmentId = searchParams.get('assignmentId')

    if (!assignmentId) {
      return NextResponse.json({ error: "Assignment ID is required" }, { status: 400 })
    }

    // Delete the assignment
    await prisma.schedule_assignments.delete({
      where: { id: assignmentId }
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "DELETE",
        resource: "ScheduleAssignment", 
        resourceId: assignmentId,
        details: {}
      }
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error deleting assignment:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { rosterPeriodId, doctorId, date, postName, scheduleGenerationId } = await request.json()

    if (!rosterPeriodId || !doctorId || !date || !postName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Create new assignment
    const newAssignment = await prisma.schedule_assignments.create({
      data: {
        id: `assign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        rosterPeriodId,
        doctorId,
        date: new Date(date),
        postName,
        scheduleGenerationId: scheduleGenerationId || null
      },
      include: {
        doctors: true
      }
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "CREATE",
        resource: "ScheduleAssignment",
        resourceId: newAssignment.id,
        details: {
          doctorId,
          date,
          postName,
          rosterPeriodId
        }
      }
    })

    return NextResponse.json({ 
      success: true, 
      assignment: newAssignment 
    })

  } catch (error) {
    console.error('Error creating assignment:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}