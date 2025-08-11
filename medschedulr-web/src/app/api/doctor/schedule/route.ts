import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "DOCTOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!session.user.doctorId) {
      return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const rosterPeriodId = searchParams.get('rosterPeriodId')

    if (rosterPeriodId) {
      // Get assignments for specific roster period
      const assignments = await prisma.scheduleAssignment.findMany({
        where: { 
          doctorId: session.user.doctorId,
          rosterPeriodId
        },
        include: {
          rosterPeriod: true
        },
        orderBy: [
          { date: 'asc' },
          { postName: 'asc' }
        ]
      })

      const rosterPeriod = assignments[0]?.rosterPeriod || await prisma.rosterPeriod.findUnique({
        where: { id: rosterPeriodId }
      })

      return NextResponse.json({
        assignments: assignments.map(assignment => ({
          id: assignment.id,
          date: assignment.date,
          postName: assignment.postName,
          rosterPeriod: {
            id: assignment.rosterPeriod.id,
            name: assignment.rosterPeriod.name,
            startDate: assignment.rosterPeriod.startDate,
            endDate: assignment.rosterPeriod.endDate
          }
        })),
        rosterPeriod: rosterPeriod ? {
          id: rosterPeriod.id,
          name: rosterPeriod.name,
          startDate: rosterPeriod.startDate,
          endDate: rosterPeriod.endDate
        } : null
      })
    } else {
      // Get all recent assignments across all roster periods
      const assignments = await prisma.scheduleAssignment.findMany({
        where: { 
          doctorId: session.user.doctorId
        },
        include: {
          rosterPeriod: true
        },
        orderBy: [
          { date: 'desc' }
        ],
        take: 50
      })

      // Get roster periods with assignments for this doctor
      const rosterPeriodsWithAssignments = await prisma.rosterPeriod.findMany({
        where: {
          scheduleAssignments: {
            some: {
              doctorId: session.user.doctorId
            }
          }
        },
        include: {
          _count: {
            select: {
              scheduleAssignments: {
                where: {
                  doctorId: session.user.doctorId
                }
              }
            }
          }
        },
        orderBy: { startDate: 'desc' },
        take: 10
      })

      return NextResponse.json({
        assignments: assignments.map(assignment => ({
          id: assignment.id,
          date: assignment.date,
          postName: assignment.postName,
          rosterPeriod: {
            id: assignment.rosterPeriod.id,
            name: assignment.rosterPeriod.name,
            startDate: assignment.rosterPeriod.startDate,
            endDate: assignment.rosterPeriod.endDate
          }
        })),
        rosterPeriods: rosterPeriodsWithAssignments.map(period => ({
          id: period.id,
          name: period.name,
          startDate: period.startDate,
          endDate: period.endDate,
          assignmentCount: period._count.scheduleAssignments
        }))
      })
    }

  } catch (error) {
    console.error('Error fetching doctor schedule:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}