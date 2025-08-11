import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const rosterPeriodId = searchParams.get('rosterPeriodId')

    if (rosterPeriodId) {
      // Get specific schedule for a roster period
      const scheduleGeneration = await prisma.scheduleGeneration.findFirst({
        where: { 
          rosterPeriodId,
          status: 'COMPLETED'
        },
        orderBy: { completedAt: 'desc' },
        include: {
          rosterPeriod: true,
          requestedBy: {
            select: { email: true }
          }
        }
      })

      if (!scheduleGeneration) {
        return NextResponse.json({ error: "No completed schedule found for this roster period" }, { status: 404 })
      }

      // Get schedule assignments
      const assignments = await prisma.scheduleAssignment.findMany({
        where: { rosterPeriodId },
        include: {
          doctor: {
            include: { unit: true }
          }
        },
        orderBy: [
          { date: 'asc' },
          { postName: 'asc' },
          { doctor: { displayName: 'asc' } }
        ]
      })

      // Get roster period details
      const rosterPeriod = await prisma.rosterPeriod.findUnique({
        where: { id: rosterPeriodId }
      })

      return NextResponse.json({
        scheduleGeneration,
        rosterPeriod,
        assignments: assignments.map(assignment => ({
          id: assignment.id,
          date: assignment.date,
          postName: assignment.postName,
          doctor: {
            id: assignment.doctor.id,
            name: assignment.doctor.displayName,
            unit: assignment.doctor.unit.name,
            category: assignment.doctor.category
          }
        }))
      })
    } else {
      // Get all recent schedule generations
      const scheduleGenerations = await prisma.scheduleGeneration.findMany({
        include: {
          rosterPeriod: true,
          requestedBy: {
            select: { email: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      })

      return NextResponse.json({ scheduleGenerations })
    }

  } catch (error) {
    console.error('Error fetching schedules:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}