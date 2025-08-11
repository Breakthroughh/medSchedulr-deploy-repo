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
    
    if (!session || session.user.role !== "DOCTOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Find the doctor record using the session user's doctorId
    if (!session.user.doctorId) {
      return NextResponse.json({ error: "Doctor profile not found for user" }, { status: 404 })
    }

    const doctor = await prisma.doctor.findUnique({
      where: { 
        id: session.user.doctorId
      }
    })

    if (!doctor) {
      return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 })
    }

    // Check if the request exists and belongs to this doctor
    const availabilityRequest = await prisma.availabilityRequest.findUnique({
      where: { id },
      include: {
        doctor: {
          select: {
            displayName: true
          }
        }
      }
    })

    if (!availabilityRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 })
    }

    if (availabilityRequest.doctorId !== doctor.id) {
      return NextResponse.json({ error: "You can only cancel your own requests" }, { status: 403 })
    }

    // Only allow cancellation of pending requests
    if (availabilityRequest.status !== 'PENDING') {
      return NextResponse.json({ 
        error: "Only pending requests can be cancelled" 
      }, { status: 400 })
    }

    // Delete the availability request (cascade will handle related records)
    await prisma.availabilityRequest.delete({
      where: { id }
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "DELETE",
        resource: "AvailabilityRequest",
        resourceId: id,
        details: {
          doctorName: availabilityRequest.doctor.displayName,
          startDate: availabilityRequest.startDate,
          endDate: availabilityRequest.endDate,
          type: availabilityRequest.type,
          reason: availabilityRequest.reason
        }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error cancelling availability request:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}