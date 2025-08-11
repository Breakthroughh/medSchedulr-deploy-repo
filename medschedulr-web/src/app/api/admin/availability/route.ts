import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const requests = await prisma.availabilityRequest.findMany({
      include: {
        doctor: {
          include: {
            unit: {
              select: {
                name: true
              }
            }
          }
        },
        approvedBy: {
          select: {
            displayName: true
          }
        }
      },
      orderBy: [
        { status: 'asc' }, // PENDING first
        { createdAt: 'desc' }
      ]
    })

    return NextResponse.json({ requests })
  } catch (error) {
    console.error('Error fetching availability requests:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}