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

    const units = await prisma.unit.findMany({
      include: {
        clinicDays: {
          orderBy: {
            weekday: 'asc'
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    })

    return NextResponse.json({ units })
  } catch (error) {
    console.error('Error fetching units with clinic days:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}