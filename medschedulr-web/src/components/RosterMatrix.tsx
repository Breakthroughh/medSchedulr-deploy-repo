"use client"

import React, { useState, useMemo, useCallback } from "react"
import { format, parseISO, isWeekend, isToday, getDay } from "date-fns"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Search, Filter, Edit, Save, X, AlertTriangle, CheckCircle, Download } from "lucide-react"
import { checkViolations, type Violation } from "@/lib/violationChecker"

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
  isClinicDay?: { [doctorId: string]: { [dateStr: string]: boolean } }
  clinicByDate?: { [dateStr: string]: string[] }
  editable?: boolean
  onAssignmentUpdate?: (updatedAssignments: Assignment[]) => void
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

const formatPostName = (postName: string): string => {
  if (postName.startsWith('clinic:')) {
    const unitName = postName.split(':', 2)[1]
    return `clinic ${unitName}`
  }
  return postName
}

export default function RosterMatrix({ 
  rosterPeriod, 
  assignments, 
  doctors, 
  units, 
  isClinicDay = {},
  clinicByDate = {},
  editable = false, 
  onAssignmentUpdate 
}: RosterMatrixProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedUnits, setSelectedUnits] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [showViolations, setShowViolations] = useState(true)
  const [editingCell, setEditingCell] = useState<{ doctorId: string; dateStr: string } | null>(null)
  const [localAssignments, setLocalAssignments] = useState(assignments)
  const [isSaving, setIsSaving] = useState(false)

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

  // Calculate tallies
  const calculateRowTally = (doctor: Doctor) => {
    return localAssignments.filter(a => 
      a.doctor.id === doctor.id && 
      !a.postName.toLowerCase().includes('clinic')  // Exclude clinic from tallies
    ).length
  }

  const calculateColumnTally = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    // Only count oncall shifts (Ward, ED, Standby), not clinic
    const oncallPosts = ['ward', 'ed', 'standby', 'call']
    return localAssignments.filter(a => {
      const matchesDate = format(new Date(a.date), 'yyyy-MM-dd') === dateStr
      const isOncallPost = oncallPosts.some(post => a.postName.toLowerCase().includes(post))
      return matchesDate && isOncallPost
    }).length
  }

  // Calculate violations
  const violations = useMemo(() => {
    return checkViolations({
      assignments: localAssignments,
      doctors,
      units,
      rosterPeriod
    })
  }, [localAssignments, doctors, units, rosterPeriod])

  // Pre-index assignments for fast lookup: [doctorId][dateStr] = Assignment[]
  const assignmentIndex = useMemo(() => {
    const index: Record<string, Record<string, Assignment[]>> = {}
    
    localAssignments.forEach(assignment => {
      const doctorId = assignment.doctor.id
      const dateStr = format(parseISO(assignment.date), 'yyyy-MM-dd')
      
      if (!index[doctorId]) index[doctorId] = {}
      if (!index[doctorId][dateStr]) index[doctorId][dateStr] = []
      
      index[doctorId][dateStr].push(assignment)
    })
    
    return index
  }, [localAssignments])

  // Index violations by doctor and date for fast lookup
  const violationIndex = useMemo(() => {
    const index: Record<string, Record<string, Violation[]>> = {}
    
    violations.forEach(violation => {
      if (!index[violation.doctorId]) index[violation.doctorId] = {}
      if (!index[violation.doctorId][violation.date]) index[violation.doctorId][violation.date] = []
      index[violation.doctorId][violation.date].push(violation)
    })
    
    return index
  }, [violations])

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

  // CSV Export Function
  const exportToCSV = useCallback(() => {
    const csvData: string[][] = []
    
    // Header row
    const headerRow = ['Doctor', 'Unit', 'Category', ...dateRange.map(date => format(date, 'MMM dd (EEE)')), 'Total Oncalls']
    csvData.push(headerRow)
    
    // Data rows for each doctor
    Object.entries(doctorsByUnit).forEach(([unitName, unitDoctors]) => {
      unitDoctors.forEach(doctor => {
        const row = [
          doctor.name,
          doctor.unit,
          doctor.category
        ]
        
        // Add assignments for each date
        dateRange.forEach(date => {
          const cellContent = getCellContent(doctor, date)
          if (cellContent.type === 'assignment') {
            row.push(cellContent.display)
          } else if (cellContent.type === 'clinic_placeholder') {
            row.push('clinic available')
          } else {
            row.push('')
          }
        })
        
        // Add row total
        row.push(calculateRowTally(doctor).toString())
        csvData.push(row)
      })
    })
    
    // Add bottom tally row
    const tallyRow = ['DAILY ONCALL TOTAL', '', '', ...dateRange.map(date => calculateColumnTally(date).toString())]
    tallyRow.push(dateRange.reduce((sum, date) => sum + calculateColumnTally(date), 0).toString())
    csvData.push(tallyRow)
    
    // Convert to CSV format
    const csvContent = csvData.map(row => 
      row.map(cell => `"${cell.replace(/"/g, '""')}"}`).join(',')
    ).join('\n')
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `schedule-${rosterPeriod.name}-${format(new Date(), 'yyyy-MM-dd')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [doctorsByUnit, dateRange, calculateRowTally, calculateColumnTally, rosterPeriod.name])

  // Get cell content for a doctor on a specific date
  const getCellContent = (doctor: Doctor, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayOfWeek = getDay(date)
    const doctorAssignments = assignmentIndex[doctor.id]?.[dateStr] || []
    const cellViolations = violationIndex[doctor.id]?.[dateStr] || []
    
    if (doctorAssignments.length > 0) {
      // Show assignments
      const postNames = doctorAssignments.map(a => a.postName)
      const formattedNames = postNames.map(formatPostName)
      return {
        type: 'assignment',
        display: formattedNames.length > 1 ? formattedNames.join(' • ') : formattedNames[0],
        tooltip: formattedNames.join(', '),
        assignments: doctorAssignments,
        violations: cellViolations
      }
    } else if (isClinicDay[doctor.id]?.[dateStr]) {
      // Check if this is a clinic day but no assignment exists
      // Show empty/add state instead of "available" chip
      return {
        type: 'empty',
        display: '+',
        tooltip: 'Add assignment',
        assignments: [],
        violations: cellViolations
      }
    } else {
      // Empty cell
      return {
        type: 'empty',
        display: '',
        tooltip: '',
        assignments: [],
        violations: cellViolations
      }
    }
  }

  // Save assignment changes
  const saveAssignmentChanges = useCallback(async (updatedAssignment: Assignment, isDelete: boolean = false) => {
    if (!editable || isSaving) return
    
    setIsSaving(true)
    try {
      if (isDelete) {
        const response = await fetch(`/api/admin/schedules/assignments?assignmentId=${updatedAssignment.id}`, {
          method: 'DELETE'
        })
        
        if (response.ok) {
          setLocalAssignments(prev => prev.filter(a => a.id !== updatedAssignment.id))
          onAssignmentUpdate?.(localAssignments.filter(a => a.id !== updatedAssignment.id))
        }
      } else {
        const response = await fetch('/api/admin/schedules/assignments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignmentId: updatedAssignment.id,
            doctorId: updatedAssignment.doctor.id,
            postName: updatedAssignment.postName
          })
        })
        
        if (response.ok) {
          setLocalAssignments(prev => 
            prev.map(a => a.id === updatedAssignment.id ? updatedAssignment : a)
          )
          onAssignmentUpdate?.(localAssignments.map(a => a.id === updatedAssignment.id ? updatedAssignment : a))
        }
      }
    } catch (error) {
      console.error('Error saving assignment:', error)
      // Could add toast notification here
    } finally {
      setIsSaving(false)
      setEditingCell(null)
    }
  }, [editable, isSaving, localAssignments, onAssignmentUpdate])

  // Get violation color and icon
  const getViolationIndicator = (violations: Violation[]) => {
    if (violations.length === 0) return null
    
    const highViolations = violations.filter(v => v.severity === 'high')
    const mediumViolations = violations.filter(v => v.severity === 'medium')
    
    if (highViolations.length > 0) {
      return {
        color: 'text-red-500',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: AlertTriangle,
        tooltip: highViolations.map(v => v.message).join('; ')
      }
    } else if (mediumViolations.length > 0) {
      return {
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200', 
        icon: AlertTriangle,
        tooltip: mediumViolations.map(v => v.message).join('; ')
      }
    } else {
      return {
        color: 'text-orange-500',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200',
        icon: AlertTriangle,
        tooltip: violations.map(v => v.message).join('; ')
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Legend and Controls */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900">Legend & Controls</h3>
          {editable && (
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowViolations(!showViolations)}
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                {showViolations ? 'Hide' : 'Show'} Violations
              </Button>
              {violations.length > 0 && (
                <span className="text-xs text-gray-500">
                  {violations.length} violation{violations.length !== 1 ? 's' : ''} found
                </span>
              )}
            </div>
          )}
        </div>
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
          {showViolations && (
            <>
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span>High Violation</span>
              </div>
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                <span>Medium Violation</span>
              </div>
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <span>Low Violation</span>
              </div>
            </>
          )}
          {editable && (
            <div className="flex items-center space-x-2">
              <Edit className="w-4 h-4 text-blue-500" />
              <span>Click cells to edit</span>
            </div>
          )}
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
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
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
                      {/* Show clinic pills for this date */}
                      {clinicByDate[format(date, 'yyyy-MM-dd')] && (
                        <div className="mt-1">
                          {clinicByDate[format(date, 'yyyy-MM-dd')].map((clinicPost, i) => (
                            <div key={i} className="inline-block px-1 py-0.5 rounded text-xs bg-blue-100 text-blue-800 border border-blue-200 mb-1">
                              {formatPostName(clinicPost)}
                            </div>
                          ))}
                        </div>
                      )}
                    </th>
                  )
                })}
                {/* Row tally header */}
                <th className="bg-gray-50 border-b px-2 py-3 text-center text-xs font-medium text-gray-900 min-w-[60px]">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {Object.entries(doctorsByUnit).map(([unitName, unitDoctors]) => (
                <React.Fragment key={unitName}>
                  {/* Unit Header Row */}
                  <tr>
                    <td
                      colSpan={dateRange.length + 2}
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
                        const dateStr = format(date, 'yyyy-MM-dd')
                        const violationIndicator = showViolations ? getViolationIndicator(cellContent.violations) : null
                        const isEditing = editingCell?.doctorId === doctor.id && editingCell?.dateStr === dateStr
                        
                        return (
                          <td
                            key={dateIndex}
                            className={`
                              border-b border-r px-1 py-2 text-center text-xs relative
                              ${isWeekendDay ? 'bg-blue-50' : 'bg-white'}
                              ${isTodayDate ? 'ring-1 ring-blue-300 ring-inset' : ''}
                              ${violationIndicator ? violationIndicator.bgColor : ''}
                              ${violationIndicator ? violationIndicator.borderColor : ''}
                              ${editable && !isEditing ? 'hover:bg-gray-100 cursor-pointer' : ''}
                            `}
                            title={violationIndicator?.tooltip || cellContent.tooltip}
                            onClick={() => {
                              if (editable && !isEditing && cellContent.type !== 'clinic_placeholder') {
                                setEditingCell({ doctorId: doctor.id, dateStr })
                              }
                            }}
                          >
                            {/* Violation Indicator */}
                            {violationIndicator && showViolations && (
                              <div className={`absolute top-0 right-0 ${violationIndicator.color}`}>
                                <violationIndicator.icon className="w-3 h-3" />
                              </div>
                            )}

                            {/* Assignment Content */}
                            {cellContent.type === 'assignment' && !isEditing && (
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
                                    {editable && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          saveAssignmentChanges(assignment, true)
                                        }}
                                        className="ml-1 text-red-500 hover:text-red-700"
                                        title="Delete assignment"
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {/* Clinic Placeholder Content */}
                            {cellContent.type === 'clinic_placeholder' && !isEditing && (
                              <div className="px-1 py-0.5 rounded text-xs border bg-blue-50 text-blue-600 border-blue-200 opacity-60">
                                available
                              </div>
                            )}

                            {/* Empty Cell */}
                            {cellContent.type === 'empty' && !isEditing && editable && (
                              <div className="text-gray-400 text-xs">
                                +
                              </div>
                            )}

                            {/* Editing Interface */}
                            {isEditing && (
                              <div className="space-y-1 min-w-[120px]">
                                <select
                                  className="w-full text-xs border rounded px-1 py-0.5"
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      const newAssignment: Assignment = {
                                        id: `temp_${Date.now()}`,
                                        date: dateStr,
                                        postName: e.target.value,
                                        doctor
                                      }
                                      // You'd need to implement creating new assignments here
                                    }
                                  }}
                                >
                                  <option value="">Select post...</option>
                                  <option value="Ward 6">Ward 6</option>
                                  <option value="ED1">ED1</option>
                                  <option value="ED2">ED2</option>
                                  <option value="Standby Oncall">Standby Oncall</option>
                                </select>
                                <div className="flex justify-center space-x-1">
                                  <button
                                    onClick={() => setEditingCell(null)}
                                    className="text-gray-500 hover:text-gray-700"
                                    title="Cancel"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        )
                      })}
                      
                      {/* Row tally cell */}
                      <td className="border-b px-2 py-3 text-center text-xs font-medium text-gray-900 bg-gray-50">
                        {calculateRowTally(doctor)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              
              {/* Bottom tally row */}
              <tr className="bg-gray-50 border-t-2">
                <td className="sticky left-0 z-10 bg-gray-100 border-r px-4 py-3 text-sm font-medium text-gray-900">
                  Daily Oncall Total
                </td>
                {dateRange.map((date, index) => (
                  <td key={index} className="border-b px-2 py-3 text-center text-xs font-bold text-gray-900">
                    {calculateColumnTally(date)}
                  </td>
                ))}
                <td className="px-2 py-3 text-center text-xs font-medium text-gray-900">
                  {/* Total of all tallies */}
                  {dateRange.reduce((sum, date) => sum + calculateColumnTally(date), 0)}
                </td>
              </tr>
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