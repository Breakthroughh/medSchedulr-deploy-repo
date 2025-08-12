"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { redirect, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar, Plus, Settings, Clock, Play, Eye, Download, Trash2, Loader2, CheckCircle, XCircle } from "lucide-react"
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns"

interface ScheduleGeneration {
  id: string
  jobId: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  progress?: number
  error?: string
  result?: any
  createdAt: string
  completedAt?: string
}

interface RosterPeriod {
  id: string
  name: string
  startDate: string
  endDate: string
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED'
  createdAt: string
  scheduleGenerations?: Array<{
    id: string
    completedAt: string
    status: string
  }>
  _count?: {
    scheduleGenerations: number
  }
}

const PERIOD_STATUSES = [
  { value: 'DRAFT', label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  { value: 'ACTIVE', label: 'Active', color: 'bg-blue-100 text-blue-800' },
  { value: 'COMPLETED', label: 'Completed', color: 'bg-green-100 text-green-800' }
]

export default function AdminSchedulesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [periods, setPeriods] = useState<RosterPeriod[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  
  // Schedule generation tracking
  const [activeJobs, setActiveJobs] = useState<Map<string, ScheduleGeneration>>(new Map())
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)
  
  // Form state
  const [periodName, setPeriodName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (status === "loading") return <div>Loading...</div>
  if (!session || session.user.role !== "ADMIN") redirect("/auth/login")

  useEffect(() => {
    fetchPeriods()
  }, [])

  const fetchPeriods = async () => {
    try {
      const response = await fetch('/api/admin/roster-periods')
      const data = await response.json()
      setPeriods(data.periods || [])
    } catch (error) {
      console.error('Error fetching roster periods:', error)
    } finally {
      setLoading(false)
    }
  }

  const createPeriod = async () => {
    if (!periodName.trim() || !startDate || !endDate) return

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/admin/roster-periods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: periodName.trim(),
          startDate,
          endDate
        }),
      })

      if (response.ok) {
        setPeriodName('')
        setStartDate('')
        setEndDate('')
        setShowCreateForm(false)
        fetchPeriods()
      } else {
        const error = await response.json()
        alert(error.error || 'Error creating roster period')
      }
    } catch (error) {
      console.error('Error creating roster period:', error)
      alert('Error creating roster period')
    } finally {
      setIsSubmitting(false)
    }
  }

  const deletePeriod = async (id: string) => {
    if (!confirm('Are you sure you want to delete this roster period? This will also delete any generated schedules.')) return

    try {
      const response = await fetch(`/api/admin/roster-periods/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchPeriods()
      } else {
        const error = await response.json()
        alert(error.error || 'Error deleting roster period')
      }
    } catch (error) {
      console.error('Error deleting roster period:', error)
    }
  }

  const generateSchedule = async (periodId: string) => {
    try {
      console.log(`🚀 Starting schedule generation for period ${periodId}`)
      
      const response = await fetch('/api/admin/schedules/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rosterPeriodId: periodId
        }),
      })

      if (response.ok) {
        const result = await response.json()
        const jobId = result.jobId
        
        console.log(`✅ Schedule generation started with job ID: ${jobId}`)
        
        // Add to active jobs tracking
        const newJob: ScheduleGeneration = {
          id: result.scheduleGenerationId,
          jobId: jobId,
          status: 'PENDING',
          progress: 0,
          createdAt: new Date().toISOString()
        }
        
        setActiveJobs(prev => new Map(prev.set(periodId, newJob)))
        
        // Start polling if not already active
        if (!pollingInterval) {
          startJobPolling()
        }
        
      } else {
        const error = await response.json()
        alert(error.error || 'Error starting schedule generation')
      }
    } catch (error) {
      console.error('Error generating schedule:', error)
      alert('Error generating schedule')
    }
  }

  const startJobPolling = () => {
    if (pollingInterval) return
    
    const interval = setInterval(async () => {
      const jobsToCheck = Array.from(activeJobs.entries()).filter(
        ([_, job]) => job.status === 'PENDING' || job.status === 'RUNNING'
      )
      
      if (jobsToCheck.length === 0) {
        clearInterval(interval)
        setPollingInterval(null)
        return
      }
      
      for (const [periodId, job] of jobsToCheck) {
        try {
          const response = await fetch(`/api/admin/schedules/status/${job.jobId}`)
          if (response.ok) {
            const result = await response.json()
            
            const updatedJob: ScheduleGeneration = {
              ...job,
              status: result.status,
              progress: result.progress || 0,
              error: result.error,
              result: result.result,
              completedAt: result.completedAt
            }
            
            setActiveJobs(prev => new Map(prev.set(periodId, updatedJob)))
            
            if (result.status === 'COMPLETED') {
              console.log(`✅ Schedule generation completed for period ${periodId}`)
              // Refresh periods to show updated schedule status
              fetchPeriods()
            } else if (result.status === 'FAILED') {
              console.error(`❌ Schedule generation failed for period ${periodId}: ${result.error}`)
            }
          }
        } catch (error) {
          console.error(`Error checking job status for period ${periodId}:`, error)
        }
      }
    }, 2000) // Poll every 2 seconds
    
    setPollingInterval(interval)
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [pollingInterval])

  const getStatusInfo = (status: string) => {
    return PERIOD_STATUSES.find(s => s.value === status) || PERIOD_STATUSES[0]
  }

  const generateQuickPeriod = (weeksAhead: number) => {
    const start = startOfWeek(addWeeks(new Date(), weeksAhead), { weekStartsOn: 1 })
    const end = endOfWeek(addWeeks(start, 3), { weekStartsOn: 1 }) // 4-week period
    
    setStartDate(format(start, 'yyyy-MM-dd'))
    setEndDate(format(end, 'yyyy-MM-dd'))
    setPeriodName(`Roster Period ${format(start, 'MMM yyyy')}`)
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

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Schedule Management</h1>
          <p className="mt-2 text-gray-600">Create roster periods and generate schedules</p>
        </div>

        {/* Create Form */}
        {!showCreateForm ? (
          <div className="mb-8">
            <Button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 shadow-lg"
            >
              <Plus className="w-5 h-5" />
              <span>New Roster Period</span>
            </Button>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-gray-900">New Roster Period</h2>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false)
                    setPeriodName('')
                    setStartDate('')
                    setEndDate('')
                  }}
                >
                  Cancel
                </Button>
              </div>

              <div className="space-y-6">
                {/* Quick Setup */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quick Setup
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Button
                      variant="outline"
                      onClick={() => generateQuickPeriod(1)}
                      className="text-left"
                    >
                      <div>
                        <p className="font-medium">Next Week</p>
                        <p className="text-sm text-gray-500">4-week period starting next Monday</p>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => generateQuickPeriod(4)}
                      className="text-left"
                    >
                      <div>
                        <p className="font-medium">Next Month</p>
                        <p className="text-sm text-gray-500">4-week period starting in 4 weeks</p>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => generateQuickPeriod(8)}
                      className="text-left"
                    >
                      <div>
                        <p className="font-medium">Future Period</p>
                        <p className="text-sm text-gray-500">4-week period starting in 8 weeks</p>
                      </div>
                    </Button>
                  </div>
                </div>

                {/* Manual Setup */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Period Name
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g., Roster Period Jan 2024"
                    value={periodName}
                    onChange={(e) => setPeriodName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      min={format(new Date(), 'yyyy-MM-dd')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End Date
                    </label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate || format(new Date(), 'yyyy-MM-dd')}
                    />
                  </div>
                </div>

                <div>
                  <Button
                    onClick={createPeriod}
                    disabled={isSubmitting || !periodName.trim() || !startDate || !endDate}
                    className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg font-semibold shadow-lg"
                  >
                    <Calendar className="w-5 h-5" />
                    <span>{isSubmitting ? 'Creating...' : 'Create Period'}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Periods List */}
        <div className="bg-white shadow rounded-lg">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-6">Roster Periods</h2>
            
            {periods.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No roster periods found</h3>
                <p className="mt-1 text-sm text-gray-500">Create your first roster period to get started with scheduling.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {periods.map((period) => {
                  const statusInfo = getStatusInfo(period.status)
                  const dayCount = Math.ceil((new Date(period.endDate).getTime() - new Date(period.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1

                  return (
                    <div key={period.id} className="border rounded-lg p-6 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-lg font-medium text-gray-900">{period.name}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          </div>
                          
                          <div className="flex items-center space-x-4 mb-3">
                            <div className="flex items-center space-x-2">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <span className="text-sm text-gray-600">
                                {format(parseISO(period.startDate), 'MMM dd, yyyy')} - {format(parseISO(period.endDate), 'MMM dd, yyyy')}
                              </span>
                              <span className="text-xs text-gray-500">({dayCount} days)</span>
                            </div>
                            {(period._count?.scheduleGenerations > 0 || 
                             period.scheduleGenerations?.length > 0 ||
                             (period.scheduleGenerations && period.scheduleGenerations.some(sg => sg.status === 'COMPLETED'))) && (
                              <div className="flex items-center space-x-2">
                                <Clock className="w-4 h-4 text-green-500" />
                                <span className="text-xs text-green-600">
                                  {period._count?.scheduleGenerations || 
                                   period.scheduleGenerations?.filter(sg => sg.status === 'COMPLETED').length || 
                                   period.scheduleGenerations?.length || 0} schedule(s) generated
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="text-xs text-gray-500">
                            Created: {format(parseISO(period.createdAt), 'MMM dd, yyyy HH:mm')}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          {period.status === 'DRAFT' && (
                            (() => {
                              const activeJob = activeJobs.get(period.id)
                              const isGenerating = activeJob && (activeJob.status === 'PENDING' || activeJob.status === 'RUNNING')
                              const isCompleted = activeJob && activeJob.status === 'COMPLETED'
                              const isFailed = activeJob && activeJob.status === 'FAILED'
                              
                              if (isGenerating) {
                                return (
                                  <Button
                                    size="sm"
                                    disabled
                                    className="flex items-center space-x-1 bg-yellow-600 text-white"
                                  >
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Generating... {Math.round((activeJob.progress || 0) * 100)}%</span>
                                  </Button>
                                )
                              } else if (isCompleted) {
                                return (
                                  <Button
                                    size="sm"
                                    disabled
                                    className="flex items-center space-x-1 bg-green-600 text-white"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                    <span>Generated</span>
                                  </Button>
                                )
                              } else if (isFailed) {
                                return (
                                  <Button
                                    size="sm"
                                    onClick={() => generateSchedule(period.id)}
                                    className="flex items-center space-x-1 bg-red-600 hover:bg-red-700 text-white"
                                    title={activeJob.error || 'Generation failed'}
                                  >
                                    <XCircle className="w-4 h-4" />
                                    <span>Retry</span>
                                  </Button>
                                )
                              } else {
                                return (
                                  <Button
                                    size="sm"
                                    onClick={() => generateSchedule(period.id)}
                                    className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white"
                                  >
                                    <Play className="w-4 h-4" />
                                    <span>Generate</span>
                                  </Button>
                                )
                              }
                            })()
                          )}
                          
                          {(period._count?.scheduleGenerations > 0 || 
                           period.scheduleGenerations?.length > 0 || 
                           activeJobs.get(period.id)?.status === 'COMPLETED' ||
                           (period.scheduleGenerations && period.scheduleGenerations.some(sg => sg.status === 'COMPLETED'))) && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/admin/schedules/view/${period.id}`)}
                                className="flex items-center space-x-1"
                              >
                                <Eye className="w-4 h-4" />
                                <span>View</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex items-center space-x-1"
                              >
                                <Download className="w-4 h-4" />
                                <span>Export</span>
                              </Button>
                            </>
                          )}

                          {period.status === 'DRAFT' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deletePeriod(period.id)}
                              className="flex items-center space-x-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete</span>
                            </Button>
                          )}
                          
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex items-center space-x-1"
                          >
                            <Settings className="w-4 h-4" />
                            <span>Settings</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}