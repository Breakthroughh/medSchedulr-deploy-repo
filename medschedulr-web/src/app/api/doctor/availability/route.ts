import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "DOCTOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Find the doctor record using the session user's doctorId
    if (!session.user.doctorId) {
      return NextResponse.json({ error: "Doctor profile not found for user" }, { status: 404 })
    }

    const doctor = await prisma.doctors.findUnique({
      where: { 
        id: session.user.doctorId
      }
    })

    if (!doctor) {
      return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 })
    }

    const requests = await prisma.availabilityRequest.findMany({
      where: {
        doctorId: doctor.id
      },
      include: {
        approvedBy: {
          select: {
            displayName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({ requests })
  } catch (error) {
    console.error('Error fetching availability requests:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "DOCTOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { startDate, endDate, type, reason, postIds } = await request.json()

    // Validation
    if (!startDate || !endDate || !type || !reason?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!['LEAVE', 'UNAVAILABLE', 'BLOCK_ONCALL'].includes(type)) {
      return NextResponse.json({ error: "Invalid request type" }, { status: 400 })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    if (start > end) {
      return NextResponse.json({ error: "Start date must be before end date" }, { status: 400 })
    }

    if (start < new Date()) {
      return NextResponse.json({ error: "Start date cannot be in the past" }, { status: 400 })
    }

    // Find the doctor record using the session user's doctorId
    if (!session.user.doctorId) {
      return NextResponse.json({ error: "Doctor profile not found for user" }, { status: 404 })
    }

    const doctor = await prisma.doctors.findUnique({
      where: { 
        id: session.user.doctorId
      }
    })

    if (!doctor) {
      return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 })
    }

    // Check for overlapping requests
    const overlapping = await prisma.availabilityRequest.findFirst({
      where: {
        doctorId: doctor.id,
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          {
            startDate: { lte: end },
            endDate: { gte: start }
          }
        ]
      }
    })

    if (overlapping) {
      return NextResponse.json({ 
        error: "You already have a pending or approved request for this date range" 
      }, { status: 400 })
    }

    // Create the availability request
    const availabilityRequest = await prisma.availabilityRequest.create({
      data: {
        doctorId: doctor.id,
        startDate: start,
        endDate: end,
        type,
        reason: reason.trim(),
        status: 'PENDING'
      }
    })


    // Audit log
    await prisma.audit_logs.create({
      data: {
        userId: session.user.id,
        action: "CREATE",
        resource: "AvailabilityRequest",
        resourceId: availabilityRequest.id,
        details: {
          doctorName: doctor.displayName,
          startDate,
          endDate,
          type,
          reason: reason.trim(),
          postIds: postIds || []
        }
      }
    })

    return NextResponse.json({ request: availabilityRequest })
  } catch (error) {
    console.error('Error creating availability request:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}