"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ClipboardList, CheckCircle, XCircle, Clock, Calendar, User, AlertCircle, FileText, MessageSquare } from "lucide-react"
import { format, parseISO } from "date-fns"

interface AvailabilityRequest {
  id: string
  startDate: string
  endDate: string
  type: 'LEAVE' | 'UNAVAILABLE' | 'BLOCK_ONCALL'
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: string
  approvedAt?: string
  rejectionReason?: string
  doctors_availability_requests_doctorIdTodoctors: {
    id: string
    displayName: string
    category: string
    units: {
      name: string
    }
  }
  doctors_availability_requests_approvedByIdTodoctors?: {
    displayName: string
  }
  posts: Array<{
    postConfig: {
      id: string
      name: string
      type: string
    }
  }>
}

const REQUEST_TYPES = [
  { value: 'LEAVE', label: 'Annual Leave', color: 'bg-red-100 text-red-800', icon: Calendar },
  { value: 'UNAVAILABLE', label: 'Medical/Emergency', color: 'bg-orange-100 text-orange-800', icon: AlertCircle },
  { value: 'BLOCK_ONCALL', label: 'Block Oncall', color: 'bg-blue-100 text-blue-800', icon: ClipboardList }
]

export default function AdminAvailabilityPage() {
  const { data: session, status } = useSession()
  const [requests, setRequests] = useState<AvailabilityRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING')
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (status === "loading") return <div>Loading...</div>
  if (!session || session.user.role !== "ADMIN") redirect("/auth/login")

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/admin/availability')
      const data = await response.json()
      setRequests(data.requests || [])
    } catch (error) {
      console.error('Error fetching availability requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApproval = async (requestId: string, approved: boolean) => {
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/admin/availability/${requestId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: approved ? 'approve' : 'reject',
          rejectionReason: approved ? undefined : rejectionReason
        }),
      })

      if (response.ok) {
        setSelectedRequest(null)
        setRejectionReason('')
        fetchRequests()
      } else {
        const error = await response.json()
        alert(error.error || 'Error processing request')
      }
    } catch (error) {
      console.error('Error processing request:', error)
      alert('Error processing request')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="w-4 h-4 text-yellow-600" />
      case 'APPROVED':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'REJECTED':
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800'
      case 'APPROVED':
        return 'bg-green-100 text-green-800'
      case 'REJECTED':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const filteredRequests = requests.filter(request => {
    if (filter === 'ALL') return true
    return request.status === filter
  })

  const getRequestTypeInfo = (type: string) => {
    return REQUEST_TYPES.find(t => t.value === type) || REQUEST_TYPES[0]
  }

  const getDaysDiff = (startDate: string, endDate: string) => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    return diffDays
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
          <h1 className="text-3xl font-bold text-gray-900">Availability Requests</h1>
          <p className="mt-2 text-gray-600">Review and approve doctor availability requests</p>
        </div>

        {/* Filter Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'PENDING', label: 'Pending', count: requests.filter(r => r.status === 'PENDING').length },
              { key: 'APPROVED', label: 'Approved', count: requests.filter(r => r.status === 'APPROVED').length },
              { key: 'REJECTED', label: 'Rejected', count: requests.filter(r => r.status === 'REJECTED').length },
              { key: 'ALL', label: 'All', count: requests.length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as any)}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  filter === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  filter === tab.key
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Requests List */}
        <div className="bg-white shadow rounded-lg">
          <div className="p-6">
            {filteredRequests.length === 0 ? (
              <div className="text-center py-8">
                <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No {filter.toLowerCase()} requests found
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {filter === 'PENDING' 
                    ? 'Doctor availability requests will appear here for approval.'
                    : 'Check other tabs for more requests.'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredRequests.map((request) => {
                  const typeInfo = getRequestTypeInfo(request.type)
                  const Icon = typeInfo.icon
                  const dayCount = getDaysDiff(request.startDate, request.endDate)

                  return (
                    <div key={request.id} className="border rounded-lg p-6 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {/* Header */}
                          <div className="flex items-center space-x-3 mb-4">
                            {getStatusIcon(request.status)}
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${typeInfo.color} flex items-center space-x-1`}>
                              <Icon className="w-3 h-3" />
                              <span>{typeInfo.label}</span>
                            </span>
                          </div>

                          {/* Doctor Info */}
                          <div className="flex items-center space-x-3 mb-4">
                            <User className="w-5 h-5 text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900">{request.doctors_availability_requests_doctorIdTodoctors.displayName}</p>
                              <p className="text-sm text-gray-500">
                                {request.doctors_availability_requests_doctorIdTodoctors.category} • {request.doctors_availability_requests_doctorIdTodoctors.units.name}
                              </p>
                            </div>
                          </div>

                          {/* Date Range */}
                          <div className="mb-4">
                            <div className="flex items-center space-x-2 mb-2">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <p className="font-medium text-gray-900">
                                {format(parseISO(request.startDate), 'MMM dd, yyyy')} - {format(parseISO(request.endDate), 'MMM dd, yyyy')}
                              </p>
                              <span className="text-sm text-gray-500">({dayCount} day{dayCount > 1 ? 's' : ''})</span>
                            </div>
                          </div>

                          {/* Reason */}
                          <div className="mb-4">
                            <div className="flex items-start space-x-2">
                              <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-gray-700 mb-1">Reason:</p>
                                <p className="text-sm text-gray-600">{request.reason}</p>
                              </div>
                            </div>
                          </div>


                          {/* Rejection Reason */}
                          {request.status === 'REJECTED' && request.rejectionReason && (
                            <div className="mb-4">
                              <div className="p-3 bg-red-50 border border-red-200 rounded">
                                <div className="flex items-start space-x-2">
                                  <XCircle className="w-4 h-4 text-red-600 mt-0.5" />
                                  <div>
                                    <p className="text-sm font-medium text-red-800">Rejection Reason:</p>
                                    <p className="text-sm text-red-700 mt-1">{request.rejectionReason}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Timestamps */}
                          <div className="text-xs text-gray-500">
                            Submitted: {format(parseISO(request.createdAt), 'MMM dd, yyyy HH:mm')}
                            {request.approvedAt && (
                              <span className="ml-4">
                                {request.status === 'APPROVED' ? 'Approved' : 'Rejected'}: {format(parseISO(request.approvedAt), 'MMM dd, yyyy HH:mm')}
                                {request.doctors_availability_requests_approvedByIdTodoctors && ` by ${request.doctors_availability_requests_approvedByIdTodoctors.displayName}`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        {request.status === 'PENDING' && (
                          <div className="flex flex-col space-y-2 ml-6">
                            <Button
                              size="sm"
                              onClick={() => handleApproval(request.id, true)}
                              disabled={isSubmitting}
                              className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2"
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>Approve</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedRequest(request.id)}
                              disabled={isSubmitting}
                              className="flex items-center space-x-1 text-red-600 border-red-300 hover:bg-red-50 px-4 py-2"
                            >
                              <XCircle className="w-4 h-4" />
                              <span>Reject</span>
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Rejection Form */}
                      {selectedRequest === request.id && (
                        <div className="mt-4 pt-4 border-t">
                          <div className="bg-gray-50 p-4 rounded">
                            <h4 className="text-sm font-medium text-gray-900 mb-2">Rejection Reason</h4>
                            <textarea
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                              placeholder="Please provide a reason for rejecting this request..."
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            />
                            <div className="flex justify-end space-x-2 mt-3">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedRequest(null)
                                  setRejectionReason('')
                                }}
                                disabled={isSubmitting}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleApproval(request.id, false)}
                                disabled={isSubmitting || !rejectionReason.trim()}
                                className="bg-red-600 hover:bg-red-700 text-white flex items-center space-x-1"
                              >
                                <XCircle className="w-4 h-4" />
                                <span>{isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}</span>
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
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