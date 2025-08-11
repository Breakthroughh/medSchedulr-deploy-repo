import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const units = await prisma.unit.findMany({
      include: {
        _count: {
          select: {
            doctors: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    })

    return NextResponse.json({ units })
  } catch (error) {
    console.error('Error fetching units:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name } = await request.json()

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: "Unit name is required" }, { status: 400 })
    }

    // Check if unit name already exists
    const existingUnit = await prisma.unit.findFirst({
      where: {
        name: name.trim()
      }
    })

    if (existingUnit) {
      return NextResponse.json({ error: "Unit name already exists" }, { status: 400 })
    }

    const unit = await prisma.unit.create({
      data: {
        name: name.trim()
      }
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CREATE",
        resource: "Unit",
        resourceId: unit.id,
        details: { name: unit.name }
      }
    })

    return NextResponse.json({ unit })
  } catch (error) {
    console.error('Error creating unit:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}