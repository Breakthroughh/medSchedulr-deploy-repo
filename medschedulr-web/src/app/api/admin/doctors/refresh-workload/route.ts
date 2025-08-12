import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { refreshDoctorWorkloads } from "@/lib/workloadCalculator"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { referenceDate } = await request.json()
    
    const workloadSummaries = await refreshDoctorWorkloads(
      referenceDate ? new Date(referenceDate) : undefined
    )

    return NextResponse.json({ 
      success: true,
      message: `Updated workload for ${workloadSummaries.length} doctors`,
      summaries: workloadSummaries
    })

  } catch (error) {
    console.error('Error refreshing workload:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const referenceDate = searchParams.get('referenceDate')
    
    const workloadSummaries = await refreshDoctorWorkloads(
      referenceDate ? new Date(referenceDate) : undefined
    )

    return NextResponse.json({ 
      success: true,
      workloadSummaries
    })

  } catch (error) {
    console.error('Error calculating workload:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}