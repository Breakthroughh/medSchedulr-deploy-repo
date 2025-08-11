"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Calendar, Plus, X, Clock, AlertCircle, CheckCircle, XCircle, FileText } from "lucide-react"
import { format, parseISO, startOfWeek, addDays, isSameDay, isAfter, isBefore } from "date-fns"

interface AvailabilityRequest {
  id: string
  startDate: string
  endDate: string
  type: 'LEAVE' | 'UNAVAILABLE' | 'BLOCK_ONCALL'
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: string
  approvedAt?: string
  approvedBy?: {
    doctor: {
      displayName: string
    }
  }
  rejectionReason?: string
}

interface PostConfig {
  id: string
  name: string
  type: string
}

const REQUEST_TYPES = [
  { value: 'LEAVE', label: 'Annual Leave', description: 'Time off for vacation, personal matters', color: 'bg-red-100 text-red-800' },
  { value: 'UNAVAILABLE', label: 'Medical/Emergency', description: 'Sick leave, medical appointments, emergencies', color: 'bg-orange-100 text-orange-800' },
  { value: 'BLOCK_ONCALL', label: 'Block Oncall', description: 'Do not assign oncall shifts during this period', color: 'bg-blue-100 text-blue-800' }
]

export default function DoctorAvailabilityPage() {
  const { data: session, status } = useSession()
  const [requests, setRequests] = useState<AvailabilityRequest[]>([])
  const [posts, setPosts] = useState<PostConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  
  // Form state
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [requestType, setRequestType] = useState<'LEAVE' | 'UNAVAILABLE' | 'BLOCK_ONCALL'>('LEAVE')
  const [reason, setReason] = useState('')
  const [selectedPosts, setSelectedPosts] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (status === "loading") return <div>Loading...</div>
  if (!session || session.user.role !== "DOCTOR") redirect("/auth/login")

  useEffect(() => {
    fetchRequests()
    fetchPosts()
  }, [])

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/doctor/availability')
      const data = await response.json()
      setRequests(data.requests || [])
    } catch (error) {
      console.error('Error fetching availability requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPosts = async () => {
    try {
      const response = await fetch('/api/doctor/posts')
      const data = await response.json()
      setPosts(data.posts || [])
    } catch (error) {
      console.error('Error fetching posts:', error)
    }
  }

  const submitRequest = async () => {
    if (!startDate || !endDate || !reason.trim()) return

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/doctor/availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          type: requestType,
          reason: reason.trim(),
          postIds: []
        }),
      })

      if (response.ok) {
        setStartDate('')
        setEndDate('')
        setRequestType('LEAVE')
        setReason('')
        setSelectedPosts([])
        setShowCreateForm(false)
        fetchRequests()
      } else {
        const error = await response.json()
        alert(error.error || 'Error submitting request')
      }
    } catch (error) {
      console.error('Error submitting request:', error)
      alert('Error submitting request')
    } finally {
      setIsSubmitting(false)
    }
  }

  const cancelRequest = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this request?')) return

    try {
      const response = await fetch(`/api/doctor/availability/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchRequests()
      } else {
        const error = await response.json()
        alert(error.error || 'Error canceling request')
      }
    } catch (error) {
      console.error('Error canceling request:', error)
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
          <h1 className="text-3xl font-bold text-gray-900">My Availability Requests</h1>
          <p className="mt-2 text-gray-600">Request time off or set schedule preferences</p>
        </div>

        {/* Request Form */}
        {!showCreateForm ? (
          <div className="mb-8">
            <Button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 shadow-lg"
            >
              <Plus className="w-5 h-5" />
              <span>New Request</span>
            </Button>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-gray-900">New Availability Request</h2>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false)
                    setStartDate('')
                    setEndDate('')
                    setRequestType('LEAVE')
                    setReason('')
                    setSelectedPosts([])
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-6">
                {/* Date Range */}
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

                {/* Request Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Request Type
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {REQUEST_TYPES.map((type) => (
                      <label key={type.value} className="cursor-pointer">
                        <input
                          type="radio"
                          name="requestType"
                          value={type.value}
                          checked={requestType === type.value}
                          onChange={(e) => setRequestType(e.target.value as any)}
                          className="sr-only"
                        />
                        <div className={`border-2 rounded-lg p-4 transition-all ${
                          requestType === type.value 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <div className={`inline-block px-2 py-1 rounded text-xs font-medium mb-2 ${type.color}`}>
                            {type.label}
                          </div>
                          <p className="text-sm text-gray-600">{type.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>


                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Please provide details for your request..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500"
                  />
                </div>

                <div>
                  <Button
                    onClick={submitRequest}
                    disabled={isSubmitting || !startDate || !endDate || !reason.trim()}
                    className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg font-semibold shadow-lg"
                  >
                    <FileText className="w-5 h-5" />
                    <span>{isSubmitting ? 'Submitting...' : 'Submit Request'}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Requests List */}
        <div className="bg-white shadow rounded-lg">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-6">Your Requests</h2>
            
            {requests.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No requests found</h3>
                <p className="mt-1 text-sm text-gray-500">Create your first availability request to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {requests.map((request) => (
                  <div key={request.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          {getStatusIcon(request.status)}
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                            {request.status}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            REQUEST_TYPES.find(t => t.value === request.type)?.color || 'bg-gray-100 text-gray-800'
                          }`}>
                            {REQUEST_TYPES.find(t => t.value === request.type)?.label || request.type}
                          </span>
                        </div>
                        
                        <div className="mb-2">
                          <p className="font-medium text-gray-900">
                            {format(parseISO(request.startDate), 'MMM dd, yyyy')} - {format(parseISO(request.endDate), 'MMM dd, yyyy')}
                          </p>
                          <p className="text-sm text-gray-600 mt-1">{request.reason}</p>
                        </div>

                        <div className="text-xs text-gray-500">
                          Submitted: {format(parseISO(request.createdAt), 'MMM dd, yyyy HH:mm')}
                          {request.approvedAt && (
                            <span className="ml-4">
                              {request.status === 'APPROVED' ? 'Approved' : 'Rejected'}: {format(parseISO(request.approvedAt), 'MMM dd, yyyy HH:mm')}
                              {request.approvedBy && ` by ${request.approvedBy.doctor.displayName}`}
                            </span>
                          )}
                        </div>

                        {request.status === 'REJECTED' && request.rejectionReason && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                            <p className="text-sm text-red-800">
                              <strong>Rejection reason:</strong> {request.rejectionReason}
                            </p>
                          </div>
                        )}
                      </div>

                      {request.status === 'PENDING' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelRequest(request.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          Cancel
                        </Button>
                      )}
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