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
            include: { 
              units: {
                include: {
                  clinic_days: true
                }
              }
            }
          }
        },
        orderBy: [
          { date: 'asc' },
          { postName: 'asc' },
          { doctors: { displayName: 'asc' } }
        ]
      })

      // Get all doctors for the matrix view
      const allDoctors = await prisma.doctors.findMany({
        where: { active: true },
        include: {
          units: {
            include: {
              clinic_days: true
            }
          }
        },
        orderBy: { displayName: 'asc' }
      })

      // Get all units
      const allUnits = await prisma.unit.findMany({
        where: { active: true },
        orderBy: { name: 'asc' }
      })

      // Get roster period details
      const rosterPeriod = await prisma.rosterPeriod.findUnique({
        where: { id: rosterPeriodId }
      })

      if (!rosterPeriod) {
        return NextResponse.json({ error: "Roster period not found" }, { status: 404 })
      }

      // Build isClinicDay map to prevent "available" chips on clinic days
      const isClinicDay: { [doctorId: string]: { [dateStr: string]: boolean } } = {}
      const startDate = new Date(rosterPeriod.startDate)
      const endDate = new Date(rosterPeriod.endDate)
      
      for (const doctor of allDoctors) {
        isClinicDay[doctor.id] = {}
        const clinicWeekdays = doctor.units.clinic_days.map(cd => cd.weekday)
        
        // Check each date in the roster period
        let currentDate = new Date(startDate)
        while (currentDate <= endDate) {
          const dateStr = currentDate.toISOString().split('T')[0]
          const weekday = currentDate.getDay()
          
          // Mark as clinic day if this weekday is a clinic day for doctor's unit
          isClinicDay[doctor.id][dateStr] = clinicWeekdays.includes(weekday)
          
          currentDate.setDate(currentDate.getDate() + 1)
        }
      }

      // Build clinic assignments by date/unit for column headers
      const clinicByDate: { [dateStr: string]: string[] } = {}
      for (const assignment of assignments) {
        if (assignment.postName.startsWith('clinic:')) {
          const dateStr = assignment.date.toISOString().split('T')[0]
          if (!clinicByDate[dateStr]) {
            clinicByDate[dateStr] = []
          }
          clinicByDate[dateStr].push(assignment.postName)
        }
      }

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
            unitId: assignment.doctors.units.id,
            category: assignment.doctors.category,
            clinicDays: assignment.doctors.units.clinic_days.map(cd => cd.weekday)
          }
        })),
        doctors: allDoctors.map(doctor => ({
          id: doctor.id,
          name: doctor.displayName,
          unit: doctor.units.name,
          unitId: doctor.units.id,
          category: doctor.category,
          clinicDays: doctor.units.clinic_days.map(cd => cd.weekday)
        })),
        units: allUnits.map(unit => ({
          id: unit.id,
          name: unit.name
        })),
        isClinicDay,
        clinicByDate
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