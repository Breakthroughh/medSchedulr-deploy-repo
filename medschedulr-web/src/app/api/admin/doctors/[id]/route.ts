import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { displayName, unitId, category, workloadWeekday, workloadWeekend, workloadED, active } = await request.json()
    const { id } = await params

    // Check if doctor exists
    const existingDoctor = await prisma.doctors.findUnique({
      where: { id },
      include: { units: true }
    })

    if (!existingDoctor) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 })
    }

    // Validate category if provided
    if (category && !['FLOATER', 'JUNIOR', 'SENIOR', 'REGISTRAR'].includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 })
    }

    // Validate unit if provided
    if (unitId) {
      const unit = await prisma.unit.findUnique({
        where: { id: unitId }
      })

      if (!unit) {
        return NextResponse.json({ error: "Unit not found" }, { status: 400 })
      }
    }

    const updateData: any = {}
    if (displayName !== undefined) updateData.displayName = displayName.trim()
    if (unitId !== undefined) updateData.unitId = unitId
    if (category !== undefined) updateData.category = category
    if (workloadWeekday !== undefined) updateData.workloadWeekday = parseInt(workloadWeekday) || 0
    if (workloadWeekend !== undefined) updateData.workloadWeekend = parseInt(workloadWeekend) || 0
    if (workloadED !== undefined) updateData.workloadED = parseInt(workloadED) || 0
    if (active !== undefined) updateData.active = Boolean(active)

    const doctor = await prisma.doctors.update({
      where: { id },
      data: updateData,
      include: {
        units: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "UPDATE",
        resource: "Doctor",
        resourceId: doctor.id,
        details: { 
          oldData: {
            displayName: existingDoctor.displayName,
            unit: existingDoctor.units?.name,
            category: existingDoctor.category
          },
          newData: {
            displayName: doctor.displayName,
            unit: doctor.units?.name,
            category: doctor.category
          }
        }
      }
    })

    return NextResponse.json({ doctor })
  } catch (error) {
    console.error('Error updating doctor:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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

    // Check if doctor exists
    const doctor = await prisma.doctors.findUnique({
      where: { id },
      include: {
        users: true,
        units: true,
        availability: true,
        assignments: true
      }
    })

    if (!doctor) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 })
    }

    // Check if doctor has active schedules or availability requests
    if (doctor.assignments.length > 0 || doctor.availability.length > 0) {
      return NextResponse.json({ 
        error: "Cannot delete doctor with existing schedules or availability requests. Please remove these first." 
      }, { status: 400 })
    }

    // Delete in transaction to ensure consistency
    await prisma.$transaction(async (tx) => {
      // Delete user account if exists
      if (doctor.users) {
        await tx.user.delete({
          where: { id: doctor.users.id }
        })
      }

      // Delete doctor
      await tx.doctors.delete({
        where: { id }
      })
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "DELETE",
        resource: "Doctor",
        resourceId: id,
        details: { 
          displayName: doctor.displayName,
          email: doctor.users?.email,
          unit: doctor.units?.name
        }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting doctor:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}