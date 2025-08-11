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

    const { action, rejectionReason } = await request.json()
    const { id } = await params

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    if (action === 'reject' && (!rejectionReason || !rejectionReason.trim())) {
      return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 })
    }

    // Check if the availability request exists and is pending
    const availabilityRequest = await prisma.availabilityRequest.findUnique({
      where: { id },
      include: {
        doctor: {
          select: {
            id: true,
            displayName: true,
            unit: {
              select: {
                name: true
              }
            }
          }
        }
      }
    })

    if (!availabilityRequest) {
      return NextResponse.json({ error: "Availability request not found" }, { status: 404 })
    }

    if (availabilityRequest.status !== 'PENDING') {
      return NextResponse.json({ 
        error: "Only pending requests can be approved or rejected" 
      }, { status: 400 })
    }

    // Find the admin's doctor record (for audit purposes)
    const adminDoctor = session.user.doctorId ? await prisma.doctor.findUnique({
      where: { id: session.user.doctorId }
    }) : null

    // Update the availability request
    const updatedRequest = await prisma.availabilityRequest.update({
      where: { id },
      data: {
        status: action === 'approve' ? 'APPROVED' : 'REJECTED',
        approvedAt: new Date(),
        approvedById: adminDoctor?.id || null,
        rejectionReason: action === 'reject' ? rejectionReason.trim() : null
      }
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: action === 'approve' ? "APPROVE" : "REJECT",
        resource: "AvailabilityRequest",
        resourceId: id,
        details: {
          doctorName: availabilityRequest.doctor.displayName,
          doctorUnit: availabilityRequest.doctor.unit?.name,
          startDate: availabilityRequest.startDate,
          endDate: availabilityRequest.endDate,
          type: availabilityRequest.type,
          reason: availabilityRequest.reason,
          rejectionReason: action === 'reject' ? rejectionReason.trim() : undefined
        }
      }
    })

    return NextResponse.json({ 
      request: updatedRequest,
      message: `Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`
    })
  } catch (error) {
    console.error('Error processing availability request:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}