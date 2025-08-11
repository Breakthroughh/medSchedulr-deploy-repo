"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Calendar, Clock, MapPin, Users, ChevronDown, Filter, Download } from "lucide-react"
import { format, parseISO, startOfWeek, addDays, isSameDay, isAfter, isBefore, startOfMonth, endOfMonth } from "date-fns"

interface Assignment {
  id: string
  date: string
  postName: string
  rosterPeriod: {
    id: string
    name: string
    startDate: string
    endDate: string
  }
}

interface RosterPeriod {
  id: string
  name: string
  startDate: string
  endDate: string
  assignmentCount: number
}

interface ScheduleData {
  assignments: Assignment[]
  rosterPeriods?: RosterPeriod[]
  rosterPeriod?: RosterPeriod
}

export default function DoctorSchedulePage() {
  const { data: session, status } = useSession()
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRosterPeriod, setSelectedRosterPeriod] = useState<string>('')
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [currentDate, setCurrentDate] = useState(new Date())

  if (status === "loading") return <div>Loading...</div>
  if (!session || session.user.role !== "DOCTOR") redirect("/auth/login")

  useEffect(() => {
    fetchSchedule()
  }, [selectedRosterPeriod])

  const fetchSchedule = async () => {
    setLoading(true)
    try {
      const url = selectedRosterPeriod 
        ? `/api/doctor/schedule?rosterPeriodId=${selectedRosterPeriod}`
        : '/api/doctor/schedule'
      
      const response = await fetch(url)
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
      const dateStr = assignment.date.split('T')[0] // Handle ISO date strings
      if (!grouped[dateStr]) {
        grouped[dateStr] = []
      }
      grouped[dateStr].push(assignment)
    })
    return grouped
  }

  const getCalendarDates = () => {
    if (selectedRosterPeriod && scheduleData?.rosterPeriod) {
      // Show full roster period
      const startDate = parseISO(scheduleData.rosterPeriod.startDate)
      const endDate = parseISO(scheduleData.rosterPeriod.endDate)
      const dates = []
      let currentDate = startDate
      while (currentDate <= endDate) {
        dates.push(currentDate)
        currentDate = addDays(currentDate, 1)
      }
      return dates
    } else {
      // Show current month
      const start = startOfMonth(currentDate)
      const end = endOfMonth(currentDate)
      const dates = []
      let date = start
      while (date <= end) {
        dates.push(date)
        date = addDays(date, 1)
      }
      return dates
    }
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
            <h3 className="mt-2 text-sm font-medium text-gray-900">No schedule data found</h3>
            <p className="mt-1 text-sm text-gray-500">You don't have any schedule assignments yet.</p>
          </div>
        </div>
      </div>
    )
  }

  const { assignments, rosterPeriods } = scheduleData
  const assignmentsByDate = groupAssignmentsByDate(assignments)
  const calendarDates = getCalendarDates()

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Schedule</h1>
          <p className="mt-2 text-gray-600">
            View your shift assignments and upcoming schedules
          </p>
        </div>

        {/* Filters and Controls */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Roster Period Filter */}
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Filter by Period:</span>
                </div>
                <select
                  value={selectedRosterPeriod}
                  onChange={(e) => setSelectedRosterPeriod(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Recent Assignments</option>
                  {rosterPeriods?.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.name} ({period.assignmentCount} shifts)
                    </option>
                  ))}
                </select>
              </div>

              {/* View Toggle */}
              <div className="flex items-center space-x-2">
                <Button
                  variant={view === 'calendar' ? 'default' : 'outline'}
                  onClick={() => setView('calendar')}
                  size="sm"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Calendar
                </Button>
                <Button
                  variant={view === 'list' ? 'default' : 'outline'}
                  onClick={() => setView('list')}
                  size="sm"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  List
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              {selectedRosterPeriod && scheduleData.rosterPeriod 
                ? `${scheduleData.rosterPeriod.name} Statistics`
                : 'Recent Schedule Statistics'
              }
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{assignments.length}</div>
                <div className="text-sm text-gray-500">Total Shifts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {assignments.filter(a => a.postName.toLowerCase().includes('weekday')).length}
                </div>
                <div className="text-sm text-gray-500">Weekday Shifts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {assignments.filter(a => a.postName.toLowerCase().includes('weekend')).length}
                </div>
                <div className="text-sm text-gray-500">Weekend Shifts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {assignments.filter(a => a.postName.toLowerCase().includes('ed') || a.postName.toLowerCase().includes('emergency')).length}
                </div>
                <div className="text-sm text-gray-500">ED Shifts</div>
              </div>
            </div>
          </div>
        </div>

        {/* Schedule View */}
        <div className="bg-white shadow rounded-lg">
          <div className="p-6">
            {assignments.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No assignments found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedRosterPeriod 
                    ? "You don't have any assignments in this roster period."
                    : "You don't have any recent schedule assignments."
                  }
                </p>
              </div>
            ) : view === 'calendar' ? (
              /* Calendar View */
              <div className="space-y-6">
                {selectedRosterPeriod && scheduleData.rosterPeriod && (
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      {scheduleData.rosterPeriod.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {format(parseISO(scheduleData.rosterPeriod.startDate), 'MMM dd, yyyy')} - {format(parseISO(scheduleData.rosterPeriod.endDate), 'MMM dd, yyyy')}
                    </p>
                  </div>
                )}
                
                {calendarDates.map(date => {
                  const dateStr = format(date, 'yyyy-MM-dd')
                  const dayAssignments = assignmentsByDate[dateStr] || []
                  
                  return (
                    <div key={dateStr} className="border rounded-lg">
                      <div className="bg-gray-50 px-4 py-3 border-b">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-gray-900">
                            {format(date, 'EEEE, MMM dd, yyyy')}
                          </h4>
                          <span className="text-sm text-gray-500">
                            {dayAssignments.length} {dayAssignments.length === 1 ? 'shift' : 'shifts'}
                          </span>
                        </div>
                      </div>
                      <div className="p-4">
                        {dayAssignments.length === 0 ? (
                          <p className="text-gray-500 text-sm">No shifts scheduled</p>
                        ) : (
                          <div className="space-y-2">
                            {dayAssignments.map(assignment => (
                              <div key={assignment.id} className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <MapPin className="w-4 h-4 text-blue-600" />
                                    <span className="font-medium text-blue-900">{assignment.postName}</span>
                                  </div>
                                  <span className="text-xs text-blue-600">
                                    {assignment.rosterPeriod.name}
                                  </span>
                                </div>
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
              /* List View */
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">All Assignments</h3>
                <div className="space-y-3">
                  {assignments.map(assignment => (
                    <div key={assignment.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <Calendar className="w-4 h-4 text-gray-500" />
                            <span className="font-medium text-gray-900">
                              {format(parseISO(assignment.date), 'MMM dd, yyyy')} - {format(parseISO(assignment.date), 'EEEE')}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <MapPin className="w-4 h-4 text-blue-500" />
                            <span className="text-blue-900 font-medium">{assignment.postName}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {assignment.rosterPeriod.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {format(parseISO(assignment.rosterPeriod.startDate), 'MMM dd')} - {format(parseISO(assignment.rosterPeriod.endDate), 'MMM dd, yyyy')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}