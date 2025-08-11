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

    const { weekdays } = await request.json()
    const { id } = params

    // Validate weekdays array
    if (!Array.isArray(weekdays)) {
      return NextResponse.json({ error: "Weekdays must be an array" }, { status: 400 })
    }

    const validWeekdays = weekdays.filter(day => 
      Number.isInteger(day) && day >= 0 && day <= 6
    )

    // Check if unit exists
    const unit = await prisma.unit.findUnique({
      where: { id },
      include: {
        clinicDays: true
      }
    })

    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 })
    }

    // Update clinic days in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete existing clinic days
      await tx.clinicDay.deleteMany({
        where: { unitId: id }
      })

      // Create new clinic days
      if (validWeekdays.length > 0) {
        await tx.clinicDay.createMany({
          data: validWeekdays.map(weekday => ({
            unitId: id,
            weekday
          }))
        })
      }
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE",
        resource: "ClinicDays",
        resourceId: id,
        details: {
          unitName: unit.name,
          oldClinicDays: unit.clinicDays.map(cd => cd.weekday),
          newClinicDays: validWeekdays
        }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating clinic days:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}