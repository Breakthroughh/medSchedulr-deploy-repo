"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { redirect, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Calendar, ArrowLeft, Download, Users, Clock, CheckCircle, Grid } from "lucide-react"
import { format, parseISO, startOfWeek, addDays } from "date-fns"
import RosterMatrix from "@/components/RosterMatrix"

interface Doctor {
  id: string
  name: string
  unit: string
  unitId: string
  category: string
  clinicDays: number[]
}

interface Assignment {
  id: string
  date: string
  postName: string
  doctor: Doctor
}

interface ScheduleData {
  scheduleGeneration: {
    id: string
    status: string
    createdAt: string
    completedAt: string
    users?: {
      name?: string
      email?: string
    }
    result?: {
      statistics: {
        total_assignments: number
        doctors_used: number
        solver_status: string
        objective_value: number
      }
    }
  }
  rosterPeriod: {
    id: string
    name: string
    startDate: string
    endDate: string
  }
  assignments: Assignment[]
  doctors: Doctor[]
  units: Array<{ id: string; name: string }>
}

export default function ScheduleViewPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const rosterPeriodId = params.rosterPeriodId as string
  
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'calendar' | 'list' | 'matrix'>('matrix')

  if (status === "loading") return <div>Loading...</div>
  if (!session || session.user.role !== "ADMIN") redirect("/auth/login")

  useEffect(() => {
    fetchSchedule()
  }, [rosterPeriodId])

  const fetchSchedule = async () => {
    try {
      const response = await fetch(`/api/admin/schedules?rosterPeriodId=${rosterPeriodId}`)
      if (response.ok) {
        const data = await response.json()
        setScheduleData(data)
      } else {
        const error = await response.json()
        alert(error.error || 'Error fetching schedule')
      }
    } catch (error) {
      console.error('Error fetching schedule:', error)
      alert('Error fetching schedule')
    } finally {
      setLoading(false)
    }
  }

  const groupAssignmentsByDate = (assignments: Assignment[]) => {
    const grouped: { [date: string]: Assignment[] } = {}
    assignments.forEach(assignment => {
      if (!grouped[assignment.date]) {
        grouped[assignment.date] = []
      }
      grouped[assignment.date].push(assignment)
    })
    return grouped
  }

  const groupAssignmentsByDoctor = (assignments: Assignment[]) => {
    const grouped: { [doctorId: string]: { doctor: Doctor, assignments: Assignment[] } } = {}
    assignments.forEach(assignment => {
      if (!grouped[assignment.doctor.id]) {
        grouped[assignment.doctor.id] = {
          doctor: assignment.doctor,
          assignments: []
        }
      }
      grouped[assignment.doctor.id].assignments.push(assignment)
    })
    return Object.values(grouped).sort((a, b) => a.doctor.name.localeCompare(b.doctor.name))
  }


  if (loading) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!scheduleData) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <Calendar className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No schedule found</h3>
            <p className="mt-1 text-sm text-gray-500">This roster period doesn't have a generated schedule.</p>
            <Button 
              onClick={() => window.history.back()}
              className="mt-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const { scheduleGeneration, rosterPeriod, assignments, doctors, units } = scheduleData
  const assignmentsByDate = groupAssignmentsByDate(assignments)
  const assignmentsByDoctor = groupAssignmentsByDoctor(assignments)

  // Generate date range
  const startDate = parseISO(rosterPeriod.startDate)
  const endDate = parseISO(rosterPeriod.endDate)
  const dateRange = []
  let currentDate = startDate
  while (currentDate <= endDate) {
    dateRange.push(currentDate)
    currentDate = addDays(currentDate, 1)
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <Button
                variant="outline"
                onClick={() => window.history.back()}
                className="mb-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Schedules
              </Button>
              <h1 className="text-3xl font-bold text-gray-900">{rosterPeriod.name}</h1>
              <p className="mt-2 text-gray-600">
                {format(startDate, 'MMM dd, yyyy')} - {format(endDate, 'MMM dd, yyyy')}
                <span className="ml-4 text-sm">
                  Generated by {scheduleGeneration.users?.email || 'Unknown'} on {format(parseISO(scheduleGeneration.completedAt), 'MMM dd, yyyy HH:mm')}
                </span>
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Button 
                variant="outline"
                disabled
                title="Export functionality coming soon"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button 
                variant="outline"
                disabled
                title="Export functionality coming soon"
              >
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Schedule Statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{assignments.length}</div>
                <div className="text-sm text-gray-500">Total Assignments</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{scheduleGeneration.result?.statistics?.doctors_used || 0}</div>
                <div className="text-sm text-gray-500">Doctors Scheduled</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{scheduleGeneration.result?.statistics?.objective_value?.toFixed(1) || 'N/A'}</div>
                <div className="text-sm text-gray-500">Optimization Score</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-500 mr-2" />
                  <span className="text-sm font-medium text-green-600">
                    {scheduleGeneration.result?.statistics?.solver_status || 'Unknown'}
                  </span>
                </div>
                <div className="text-sm text-gray-500">Solver Status</div>
              </div>
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="p-4 border-b">
            <div className="flex space-x-1">
              <Button
                variant={view === 'matrix' ? 'default' : 'outline'}
                onClick={() => setView('matrix')}
                size="sm"
              >
                <Grid className="w-4 h-4 mr-2" />
                Matrix View
              </Button>
              <Button
                variant={view === 'calendar' ? 'default' : 'outline'}
                onClick={() => setView('calendar')}
                size="sm"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Calendar View
              </Button>
              <Button
                variant={view === 'list' ? 'default' : 'outline'}
                onClick={() => setView('list')}
                size="sm"
              >
                <Users className="w-4 h-4 mr-2" />
                Doctor View
              </Button>
            </div>
          </div>

          <div className="p-6">
            {view === 'matrix' ? (
              /* Matrix View */
              <RosterMatrix 
                rosterPeriod={rosterPeriod}
                assignments={assignments}
                doctors={doctors}
                units={units}
              />
            ) : view === 'calendar' ? (
              /* Calendar View */
              <div className="space-y-6">
                {dateRange.map(date => {
                  const dateStr = format(date, 'yyyy-MM-dd')
                  const dayAssignments = assignmentsByDate[dateStr] || []
                  
                  return (
                    <div key={dateStr} className="border rounded-lg">
                      <div className="bg-gray-50 px-4 py-3 border-b">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium text-gray-900">
                            {format(date, 'EEEE, MMM dd, yyyy')}
                          </h3>
                          <span className="text-sm text-gray-500">
                            {dayAssignments.length} assignments
                          </span>
                        </div>
                      </div>
                      <div className="p-4">
                        {dayAssignments.length === 0 ? (
                          <p className="text-gray-500 text-sm">No assignments</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {dayAssignments.map(assignment => (
                              <div key={assignment.id} className="bg-blue-50 rounded-lg p-3 border">
                                <div className="font-medium text-blue-900">{assignment.postName}</div>
                                <div className="text-sm text-blue-700">{assignment.doctor.name}</div>
                                <div className="text-xs text-blue-600">{assignment.doctor.unit} • {assignment.doctor.category}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Doctor View */
              <div className="space-y-4">
                {assignmentsByDoctor.map(({ doctor, assignments: doctorAssignments }) => (
                  <div key={doctor.id} className="border rounded-lg">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-gray-900">{doctor.name}</h3>
                          <p className="text-sm text-gray-500">{doctor.unit} • {doctor.category}</p>
                        </div>
                        <span className="text-sm text-gray-500">
                          {doctorAssignments.length} assignments
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {doctorAssignments.map(assignment => (
                          <div key={assignment.id} className="bg-green-50 rounded-lg p-3 border">
                            <div className="font-medium text-green-900">{assignment.postName}</div>
                            <div className="text-sm text-green-700">
                              {format(parseISO(assignment.date), 'MMM dd, yyyy')} - {format(parseISO(assignment.date), 'EEEE')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}