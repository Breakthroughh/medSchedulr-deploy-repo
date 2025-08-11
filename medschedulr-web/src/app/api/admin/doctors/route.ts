import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const doctors = await prisma.doctor.findMany({
      include: {
        unit: {
          select: {
            id: true,
            name: true
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            active: true
          }
        }
      },
      orderBy: {
        displayName: 'asc'
      }
    })

    return NextResponse.json({ doctors })
  } catch (error) {
    console.error('Error fetching doctors:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { displayName, email, unitId, category } = await request.json()

    // Validation
    if (!displayName || !email || !unitId || !category) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    if (!['FLOATER', 'JUNIOR', 'SENIOR', 'REGISTRAR'].includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 })
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (existingUser) {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 })
    }

    // Check if unit exists
    const unit = await prisma.unit.findUnique({
      where: { id: unitId }
    })

    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 400 })
    }

    // Create doctor and user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create doctor first
      const doctor = await tx.doctor.create({
        data: {
          displayName: displayName.trim(),
          unitId,
          category,
          workloadWeekday: 0,
          workloadWeekend: 0,
          workloadED: 0
        }
      })

      // Generate default password (doctor123)
      const hashedPassword = await bcrypt.hash('doctor123', 12)

      // Create user account
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          role: 'DOCTOR',
          doctorId: doctor.id
        }
      })

      return { doctor, user }
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE",
        resource: "Doctor",
        resourceId: result.doctor.id,
        details: { 
          displayName: result.doctor.displayName,
          email: result.user.email,
          unit: unit.name,
          category
        }
      }
    })

    return NextResponse.json({ 
      doctor: result.doctor,
      message: "Doctor created successfully. Default password: doctor123" 
    })
  } catch (error) {
    console.error('Error creating doctor:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}