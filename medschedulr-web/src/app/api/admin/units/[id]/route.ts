import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name } = await request.json()
    const { id } = params

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: "Unit name is required" }, { status: 400 })
    }

    // Check if unit exists
    const existingUnit = await prisma.unit.findUnique({
      where: { id }
    })

    if (!existingUnit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    // Check if new name conflicts with another unit
    const nameConflict = await prisma.unit.findFirst({
      where: {
        name: name.trim(),
        id: { not: id }
      }
    })

    if (nameConflict) {
      return NextResponse.json({ error: "Unit name already exists" }, { status: 400 })
    }

    const unit = await prisma.unit.update({
      where: { id },
      data: {
        name: name.trim()
      }
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "UPDATE",
        resource: "Unit",
        resourceId: unit.id,
        details: { 
          oldName: existingUnit.name,
          newName: unit.name 
        }
      }
    })

    return NextResponse.json({ unit })
  } catch (error) {
    console.error('Error updating unit:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = params

    // Check if unit exists and has doctors
    const unit = await prisma.unit.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            doctors: true
          }
        }
      }
    })

    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    if (unit._count.doctors > 0) {
      return NextResponse.json({ 
        error: "Cannot delete unit with assigned doctors. Please reassign doctors first." 
      }, { status: 400 })
    }

    await prisma.unit.delete({
      where: { id }
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "DELETE",
        resource: "Unit",
        resourceId: id,
        details: { name: unit.name }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting unit:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}