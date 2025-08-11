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
      const scheduleGeneration = await prisma.schedule_generations.findFirst({
        where: { 
          rosterPeriodId,
          status: 'COMPLETED'
        },
        orderBy: { completedAt: 'desc' },
        include: {
          roster_periods: true,
          users: {
            select: { email: true }
          }
        }
      })

      if (!scheduleGeneration) {
        return NextResponse.json({ error: "No completed schedule found for this roster period" }, { status: 404 })
      }

      // Get schedule assignments
      const assignments = await prisma.schedule_assignments.findMany({
        where: { rosterPeriodId },
        include: {
          doctors: {
            include: { units: true }
          }
        },
        orderBy: [
          { date: 'asc' },
          { postName: 'asc' },
          { doctors: { displayName: 'asc' } }
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
            id: assignment.doctors.id,
            name: assignment.doctors.displayName,
            unit: assignment.doctors.units.name,
            category: assignment.doctors.category
          }
        }))
      })
    } else {
      // Get all recent schedule generations
      const scheduleGenerations = await prisma.schedule_generations.findMany({
        include: {
          roster_periods: true,
          users: {
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