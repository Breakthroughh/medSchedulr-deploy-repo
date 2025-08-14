"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Clock, Calendar, AlertCircle, TrendingUp } from "lucide-react"

interface WorkloadSummary {
  doctorId: string
  weekdayOncalls: number
  weekendOncalls: number
  edCovers: number
  lastStandbyDate: string | null
  daysSinceLastStandby: number
  standbyCount12Months: number
  standbyCount3Months: number
}

interface WorkloadDisplayProps {
  doctorId?: string
  doctorName?: string
  compact?: boolean
  showRefreshButton?: boolean
}

export default function WorkloadDisplay({ doctorId, doctorName, compact = false, showRefreshButton = false }: WorkloadDisplayProps) {
  const [workloadData, setWorkloadData] = useState<WorkloadSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchWorkloadData = async () => {
    try {
      const params = new URLSearchParams()
      if (doctorId) params.set('doctorId', doctorId)
      
      const response = await fetch(`/api/doctors/workload?${params}`)
      if (response.ok) {
        const data = await response.json()
        if (data.workloadSummaries && data.workloadSummaries.length > 0) {
          setWorkloadData(data.workloadSummaries[0])
        }
      }
    } catch (error) {
      console.error('Error fetching workload data:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchWorkloadData()
  }

  useEffect(() => {
    fetchWorkloadData()
  }, [doctorId])

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
      </div>
    )
  }

  if (!workloadData) {
    return (
      <div className="text-sm text-gray-500">
        No workload data available
      </div>
    )
  }

  const formatLastStandbyDate = (dateStr: string | null, days: number) => {
    if (!dateStr) return "Never"
    if (days > 365) return `${format(new Date(dateStr), 'MMM dd, yyyy')} (${Math.floor(days / 365)}+ years ago)`
    if (days > 30) return `${format(new Date(dateStr), 'MMM dd, yyyy')} (${Math.floor(days / 30)} months ago)`
    return `${format(new Date(dateStr), 'MMM dd, yyyy')} (${days} days ago)`
  }

  const getStandbyStatus = () => {
    if (workloadData.standbyCount12Months > 0) {
      return { text: "Done this year", color: "text-red-600", bgColor: "bg-red-50" }
    }
    if (workloadData.daysSinceLastStandby > 365) {
      return { text: "Eligible", color: "text-green-600", bgColor: "bg-green-50" }
    }
    return { text: "Recent standby", color: "text-orange-600", bgColor: "bg-orange-50" }
  }

  const standbyStatus = getStandbyStatus()

  if (compact) {
    return (
      <div className="text-sm">
        {doctorName && <div className="font-medium text-gray-900 mb-2">{doctorName}</div>}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500">Last Standby:</span>
            <div className="font-medium">{formatLastStandbyDate(workloadData.lastStandbyDate, workloadData.daysSinceLastStandby)}</div>
          </div>
          <div>
            <span className="text-gray-500">Status:</span>
            <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${standbyStatus.color} ${standbyStatus.bgColor}`}>
              {standbyStatus.text}
            </div>
          </div>
          <div>
            <span className="text-gray-500">3M Load:</span>
            <div className="font-medium">{workloadData.weekdayOncalls + workloadData.weekendOncalls} oncalls</div>
          </div>
          <div>
            <span className="text-gray-500">Standby 12M:</span>
            <div className="font-medium">{workloadData.standbyCount12Months}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2" />
          Workload Summary
          {doctorName && <span className="ml-2 text-base text-gray-600">- {doctorName}</span>}
        </h3>
        {showRefreshButton && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Standby Status */}
        <div className={`p-4 rounded-lg ${standbyStatus.bgColor}`}>
          <div className="flex items-center">
            <AlertCircle className={`w-5 h-5 mr-2 ${standbyStatus.color}`} />
            <div>
              <div className="text-sm font-medium text-gray-700">Standby Status</div>
              <div className={`font-semibold ${standbyStatus.color}`}>{standbyStatus.text}</div>
            </div>
          </div>
        </div>

        {/* Last Standby Date */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-gray-600" />
            <div>
              <div className="text-sm font-medium text-gray-700">Last Standby</div>
              <div className="font-semibold text-gray-900">
                {formatLastStandbyDate(workloadData.lastStandbyDate, workloadData.daysSinceLastStandby)}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Workload (3 months) */}
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center">
            <Clock className="w-5 h-5 mr-2 text-blue-600" />
            <div>
              <div className="text-sm font-medium text-gray-700">Recent Workload (3M)</div>
              <div className="font-semibold text-blue-900">
                {workloadData.weekdayOncalls + workloadData.weekendOncalls} oncalls, {workloadData.edCovers} ED Cover
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-3 bg-gray-50 rounded">
          <div className="text-lg font-bold text-gray-900">{workloadData.weekdayOncalls}</div>
          <div className="text-xs text-gray-500">Weekday Oncalls (3M)</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded">
          <div className="text-lg font-bold text-gray-900">{workloadData.weekendOncalls}</div>
          <div className="text-xs text-gray-500">Weekend Oncalls (3M)</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded">
          <div className="text-lg font-bold text-gray-900">{workloadData.edCovers}</div>
          <div className="text-xs text-gray-500">ED Cover (3M)</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded">
          <div className="text-lg font-bold text-gray-900">{workloadData.standbyCount12Months}</div>
          <div className="text-xs text-gray-500">Standby (12M)</div>
        </div>
      </div>

      {workloadData.standbyCount12Months > 0 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center text-red-800">
            <AlertCircle className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">
              This doctor has already done {workloadData.standbyCount12Months} Standby Oncall assignment(s) in the past 12 months.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}