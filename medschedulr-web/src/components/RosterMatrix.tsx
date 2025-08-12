"use client"

import React, { useState, useMemo } from "react"
import { format, parseISO, isWeekend, isToday, getDay } from "date-fns"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Search, Filter } from "lucide-react"

interface Doctor {
  id: string
  name: string
  unit: string
  unitId: string
  category: string
  clinicDays: number[] // Array of weekdays (0=Sunday, 1=Monday, etc.)
}

interface Assignment {
  id: string
  date: string
  postName: string
  doctor: Doctor
}

interface RosterMatrixProps {
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

// Post type color mapping
const POST_COLORS = {
  clinic: "bg-blue-100 text-blue-800 border-blue-200",
  ed: "bg-red-100 text-red-800 border-red-200", 
  ward: "bg-green-100 text-green-800 border-green-200",
  standby: "bg-yellow-100 text-yellow-800 border-yellow-200",
  default: "bg-gray-100 text-gray-800 border-gray-200"
}

const getPostColor = (postName: string): string => {
  const post = postName.toLowerCase()
  if (post.includes('clinic')) return POST_COLORS.clinic
  if (post.includes('ed')) return POST_COLORS.ed
  if (post.includes('ward')) return POST_COLORS.ward
  if (post.includes('standby') || post.includes('call')) return POST_COLORS.standby
  return POST_COLORS.default
}

const getPostType = (postName: string): string => {
  const post = postName.toLowerCase()
  if (post.includes('clinic')) return 'clinic'
  if (post.includes('ed')) return 'ed'
  if (post.includes('ward')) return 'ward'
  if (post.includes('standby') || post.includes('call')) return 'standby'
  return 'other'
}

export default function RosterMatrix({ rosterPeriod, assignments, doctors, units }: RosterMatrixProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedUnits, setSelectedUnits] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)

  // Generate date range
  const dateRange = useMemo(() => {
    const dates = []
    const start = parseISO(rosterPeriod.startDate)
    const end = parseISO(rosterPeriod.endDate)
    let current = start
    
    while (current <= end) {
      dates.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    return dates
  }, [rosterPeriod.startDate, rosterPeriod.endDate])

  // Pre-index assignments for fast lookup: [doctorId][dateStr] = Assignment[]
  const assignmentIndex = useMemo(() => {
    const index: Record<string, Record<string, Assignment[]>> = {}
    
    assignments.forEach(assignment => {
      const doctorId = assignment.doctor.id
      const dateStr = format(parseISO(assignment.date), 'yyyy-MM-dd')
      
      if (!index[doctorId]) index[doctorId] = {}
      if (!index[doctorId][dateStr]) index[doctorId][dateStr] = []
      
      index[doctorId][dateStr].push(assignment)
    })
    
    return index
  }, [assignments])

  // Filter doctors
  const filteredDoctors = useMemo(() => {
    return doctors.filter(doctor => {
      const matchesSearch = searchTerm === "" || 
        doctor.name.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesUnit = selectedUnits.length === 0 || 
        selectedUnits.includes(doctor.unitId)
      
      return matchesSearch && matchesUnit
    })
  }, [doctors, searchTerm, selectedUnits])

  // Group doctors by unit
  const doctorsByUnit = useMemo(() => {
    const grouped: Record<string, Doctor[]> = {}
    
    filteredDoctors.forEach(doctor => {
      if (!grouped[doctor.unit]) grouped[doctor.unit] = []
      grouped[doctor.unit].push(doctor)
    })
    
    // Sort doctors within each unit by name
    Object.keys(grouped).forEach(unit => {
      grouped[unit].sort((a, b) => a.name.localeCompare(b.name))
    })
    
    return grouped
  }, [filteredDoctors])

  // Get cell content for a doctor on a specific date
  const getCellContent = (doctor: Doctor, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayOfWeek = getDay(date)
    const doctorAssignments = assignmentIndex[doctor.id]?.[dateStr] || []
    
    if (doctorAssignments.length > 0) {
      // Show assignments
      const postNames = doctorAssignments.map(a => a.postName)
      return {
        type: 'assignment',
        display: postNames.length > 1 ? postNames.join(' • ') : postNames[0],
        tooltip: postNames.join(', '),
        assignments: doctorAssignments
      }
    } else if (doctor.clinicDays.includes(dayOfWeek)) {
      // Show clinic day
      return {
        type: 'clinic',
        display: 'clinic',
        tooltip: 'Clinic day',
        assignments: []
      }
    } else {
      // Empty cell
      return {
        type: 'empty',
        display: '',
        tooltip: '',
        assignments: []
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Legend</h3>
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center space-x-2">
            <div className={`px-2 py-1 rounded border ${POST_COLORS.clinic}`}>Clinic</div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`px-2 py-1 rounded border ${POST_COLORS.ed}`}>ED</div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`px-2 py-1 rounded border ${POST_COLORS.ward}`}>Ward</div>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`px-2 py-1 rounded border ${POST_COLORS.standby}`}>Standby/Call</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900">Filters</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            {showFilters ? 'Hide' : 'Show'} Filters
          </Button>
        </div>
        
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Search Doctors
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by doctor name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Filter by Units
              </label>
              <Select 
                value={selectedUnits.length > 0 ? selectedUnits[0] : ""}
                onChange={(e) => setSelectedUnits(e.target.value ? [e.target.value] : [])}
              >
                <option value="">All units</option>
                {units.map(unit => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Matrix Grid */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-auto max-h-[800px]">
          <table className="w-full border-collapse">
            {/* Header Row */}
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 bg-gray-50 border-r border-b px-4 py-3 text-left text-xs font-medium text-gray-900 min-w-[200px]">
                  Doctor / Unit
                </th>
                {dateRange.map((date, index) => {
                  const isWeekendDay = isWeekend(date)
                  const isTodayDate = isToday(date)
                  
                  return (
                    <th
                      key={index}
                      className={`
                        border-b px-2 py-3 text-center text-xs font-medium min-w-[80px]
                        ${isWeekendDay ? 'bg-blue-50 text-blue-900' : 'bg-gray-50 text-gray-900'}
                        ${isTodayDate ? 'ring-2 ring-blue-500 ring-inset' : ''}
                      `}
                    >
                      <div>{format(date, 'MMM dd')}</div>
                      <div className="text-xs opacity-75">{format(date, 'EEE')}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {Object.entries(doctorsByUnit).map(([unitName, unitDoctors]) => (
                <React.Fragment key={unitName}>
                  {/* Unit Header Row */}
                  <tr>
                    <td
                      colSpan={dateRange.length + 1}
                      className="bg-gray-100 border-b px-4 py-2 text-sm font-medium text-gray-900"
                    >
                      {unitName} ({unitDoctors.length} doctors)
                    </td>
                  </tr>
                  
                  {/* Doctor Rows */}
                  {unitDoctors.map((doctor) => (
                    <tr key={doctor.id} className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white border-r border-b px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900">{doctor.name}</div>
                        <div className="text-xs text-gray-500">{doctor.category}</div>
                      </td>
                      
                      {dateRange.map((date, dateIndex) => {
                        const cellContent = getCellContent(doctor, date)
                        const isWeekendDay = isWeekend(date)
                        const isTodayDate = isToday(date)
                        
                        return (
                          <td
                            key={dateIndex}
                            className={`
                              border-b border-r px-1 py-2 text-center text-xs relative
                              ${isWeekendDay ? 'bg-blue-50' : 'bg-white'}
                              ${isTodayDate ? 'ring-1 ring-blue-300 ring-inset' : ''}
                            `}
                            title={cellContent.tooltip}
                          >
                            {cellContent.type === 'assignment' && (
                              <div className="space-y-1">
                                {cellContent.assignments.map((assignment, i) => (
                                  <div
                                    key={i}
                                    className={`
                                      px-1 py-0.5 rounded text-xs border truncate
                                      ${getPostColor(assignment.postName)}
                                    `}
                                    title={`${assignment.postName} - ${doctor.name}`}
                                  >
                                    {assignment.postName}
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {cellContent.type === 'clinic' && (
                              <div className={`px-1 py-0.5 rounded text-xs border ${POST_COLORS.clinic}`}>
                                clinic
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Summary</h3>
        <div className="text-xs text-gray-600">
          Showing {Object.values(doctorsByUnit).flat().length} doctors across {Object.keys(doctorsByUnit).length} units
          for {dateRange.length} days ({assignments.length} total assignments)
        </div>
      </div>
    </div>
  )
}