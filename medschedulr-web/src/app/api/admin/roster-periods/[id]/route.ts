import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Check if period exists
    const period = await prisma.rosterPeriod.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            schedule_generations: true,
            schedule_assignments: true,
            availability: true
          }
        }
      }
    })

    if (!period) {
      return NextResponse.json({ error: "Roster period not found" }, { status: 404 })
    }

    // Only allow deletion of DRAFT periods or periods with no generated schedules
    if (period.status !== 'DRAFT' && period._count.schedule_generations > 0) {
      return NextResponse.json({ 
        error: "Cannot delete active periods with generated schedules" 
      }, { status: 400 })
    }

    // Delete related records first, then the roster period
    await prisma.$transaction(async (tx) => {
      // Delete schedule assignments first
      await tx.schedule_assignments.deleteMany({
        where: { rosterPeriodId: id }
      })

      // Delete schedule generations
      await tx.schedule_generations.deleteMany({
        where: { rosterPeriodId: id }
      })

      // Delete availability records
      await tx.availability.deleteMany({
        where: { rosterPeriodId: id }
      })

      // Finally delete the roster period
      await tx.rosterPeriod.delete({
        where: { id }
      })
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "DELETE",
        resource: "RosterPeriod",
        resourceId: id,
        details: {
          name: period.name,
          startDate: period.startDate,
          endDate: period.endDate,
          status: period.status
        }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting roster period:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name, startDate, endDate, status } = await request.json()
    const { id } = await params

    // Check if period exists
    const period = await prisma.rosterPeriod.findUnique({
      where: { id }
    })

    if (!period) {
      return NextResponse.json({ error: "Roster period not found" }, { status: 404 })
    }

    // Build update data
    const updateData: any = {}

    if (name && name.trim()) {
      updateData.name = name.trim()
    }

    if (startDate) {
      const start = new Date(startDate)
      if (start < new Date() && period.status === 'DRAFT') {
        return NextResponse.json({ error: "Start date cannot be in the past" }, { status: 400 })
      }
      updateData.startDate = start
    }

    if (endDate) {
      const end = new Date(endDate)
      updateData.endDate = end
    }

    if (status && ['DRAFT', 'ACTIVE', 'COMPLETED'].includes(status)) {
      updateData.status = status
    }

    // Validate dates if both are provided
    if (updateData.startDate && updateData.endDate) {
      if (updateData.startDate >= updateData.endDate) {
        return NextResponse.json({ error: "Start date must be before end date" }, { status: 400 })
      }
    }

    // Update the period
    const updatedPeriod = await prisma.rosterPeriod.update({
      where: { id },
      data: updateData
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        userId: session.user.id,
        action: "UPDATE",
        resource: "RosterPeriod",
        resourceId: id,
        details: {
          oldData: {
            name: period.name,
            startDate: period.startDate,
            endDate: period.endDate,
            status: period.status
          },
          newData: updateData
        }
      }
    })

    return NextResponse.json({ period: updatedPeriod })
  } catch (error) {
    console.error('Error updating roster period:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}