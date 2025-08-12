import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { refreshDoctorWorkloads } from "@/lib/workloadCalculator"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || !["ADMIN", "DOCTOR"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const doctorId = searchParams.get('doctorId')
    const referenceDate = searchParams.get('referenceDate')

    // For doctors, they can only see their own workload
    if (session.user.role === "DOCTOR" && doctorId && doctorId !== session.user.doctorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const workloadSummaries = await refreshDoctorWorkloads(
      referenceDate ? new Date(referenceDate) : undefined
    )

    // Filter to specific doctor if requested
    let filteredSummaries = workloadSummaries
    if (doctorId) {
      filteredSummaries = workloadSummaries.filter(w => w.doctorId === doctorId)
    } else if (session.user.role === "DOCTOR" && session.user.doctorId) {
      // If doctor role and no specific doctor requested, return their own
      filteredSummaries = workloadSummaries.filter(w => w.doctorId === session.user.doctorId)
    }

    return NextResponse.json({ 
      success: true,
      workloadSummaries: filteredSummaries
    })

  } catch (error) {
    console.error('Error calculating workload:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}