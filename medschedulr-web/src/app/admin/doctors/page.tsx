"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Edit, Trash2, User, Mail, Building, UserCheck, TrendingUp } from "lucide-react"
import { Select } from "@/components/ui/select"
import WorkloadDisplay from "@/components/WorkloadDisplay"

interface Unit {
  id: string
  name: string
}

interface Doctor {
  id: string
  displayName: string
  unitId: string
  category: string
  active: boolean
  workloadWeekday: number
  workloadWeekend: number
  workloadED: number
  lastStandby?: string
  units: {
    id: string
    name: string
  }
  users?: {
    id: string
    email: string
    active: boolean
  }
}

interface CreateDoctorData {
  displayName: string
  email: string
  unitId: string
  category: string
}

const DOCTOR_CATEGORIES = [
  { value: 'FLOATER', label: 'Floater' },
  { value: 'JUNIOR', label: 'Junior' },
  { value: 'SENIOR', label: 'Senior' },
  { value: 'REGISTRAR', label: 'Registrar' }
]

export default function DoctorsPage() {
  const { data: session, status } = useSession()
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null)
  const [viewingWorkload, setViewingWorkload] = useState<Doctor | null>(null)
  const [createData, setCreateData] = useState<CreateDoctorData>({
    displayName: '',
    email: '',
    unitId: '',
    category: 'JUNIOR'
  })
  const [isCreating, setIsCreating] = useState(false)

  if (status === "loading") return <div>Loading...</div>
  if (!session || session.user.role !== "ADMIN") redirect("/auth/login")

  useEffect(() => {
    fetchDoctors()
    fetchUnits()
  }, [])

  const fetchDoctors = async () => {
    try {
      const response = await fetch('/api/admin/doctors')
      const data = await response.json()
      setDoctors(data.doctors || [])
    } catch (error) {
      console.error('Error fetching doctors:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUnits = async () => {
    try {
      const response = await fetch('/api/admin/units')
      const data = await response.json()
      setUnits(data.units || [])
    } catch (error) {
      console.error('Error fetching units:', error)
    }
  }

  const createDoctor = async () => {
    if (!createData.displayName.trim() || !createData.email.trim() || !createData.unitId) {
      return
    }

    setIsCreating(true)
    try {
      const response = await fetch('/api/admin/doctors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createData),
      })

      if (response.ok) {
        setCreateData({
          displayName: '',
          email: '',
          unitId: '',
          category: 'JUNIOR'
        })
        setShowCreateForm(false)
        fetchDoctors()
      } else {
        const error = await response.json()
        alert(error.error || 'Error creating doctor')
      }
    } catch (error) {
      console.error('Error creating doctor:', error)
      alert('Error creating doctor')
    } finally {
      setIsCreating(false)
    }
  }

  const updateDoctor = async (id: string, data: Partial<Doctor>) => {
    try {
      const response = await fetch(`/api/admin/doctors/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (response.ok) {
        setEditingDoctor(null)
        fetchDoctors()
      } else {
        const error = await response.json()
        alert(error.error || 'Error updating doctor')
      }
    } catch (error) {
      console.error('Error updating doctor:', error)
    }
  }

  const deleteDoctor = async (id: string) => {
    if (!confirm('Are you sure you want to delete this doctor? This will also delete their user account.')) return

    try {
      const response = await fetch(`/api/admin/doctors/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchDoctors()
      } else {
        const error = await response.json()
        alert(error.error || 'Error deleting doctor')
      }
    } catch (error) {
      console.error('Error deleting doctor:', error)
    }
  }

  const resetCreateForm = () => {
    setCreateData({
      displayName: '',
      email: '',
      unitId: '',
      category: 'JUNIOR'
    })
    setShowCreateForm(false)
  }

  if (loading) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
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
          <h1 className="text-3xl font-bold text-gray-900">Doctor Management</h1>
          <p className="mt-2 text-gray-600">Manage doctor profiles and user accounts</p>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-gray-900">
                {showCreateForm ? 'Create New Doctor' : 'Doctors'}
              </h2>
              {!showCreateForm ? (
                <Button
                  onClick={() => setShowCreateForm(true)}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add Doctor</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={resetCreateForm}
                >
                  Cancel
                </Button>
              )}
            </div>
            
            {showCreateForm && (
              <div className="border rounded-lg p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Doctor Name
                    </label>
                    <Input
                      type="text"
                      placeholder="Dr. John Smith"
                      value={createData.displayName}
                      onChange={(e) => setCreateData({ ...createData, displayName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <Input
                      type="email"
                      placeholder="john.smith@hospital.com"
                      value={createData.email}
                      onChange={(e) => setCreateData({ ...createData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit
                    </label>
                    <Select
                      value={createData.unitId}
                      onChange={(e) => setCreateData({ ...createData, unitId: e.target.value })}
                    >
                      <option value="">Select Unit</option>
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <Select
                      value={createData.category}
                      onChange={(e) => setCreateData({ ...createData, category: e.target.value })}
                    >
                      {DOCTOR_CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="mt-6 flex space-x-3">
                  <Button
                    onClick={createDoctor}
                    disabled={isCreating || !createData.displayName.trim() || !createData.email.trim() || !createData.unitId}
                    className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg font-semibold shadow-lg border-2 border-green-600"
                  >
                    <Plus className="w-5 h-5" />
                    <span>{isCreating ? 'Creating...' : 'Create Doctor'}</span>
                  </Button>
                </div>
              </div>
            )}

            {editingDoctor && (
              <div className="border rounded-lg p-6 mb-6 bg-yellow-50">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Doctor: {editingDoctor.displayName}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Doctor Name
                    </label>
                    <Input
                      type="text"
                      value={editingDoctor.displayName}
                      onChange={(e) => setEditingDoctor({ ...editingDoctor, displayName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit
                    </label>
                    <Select
                      value={editingDoctor.unitId}
                      onChange={(e) => setEditingDoctor({ ...editingDoctor, unitId: e.target.value })}
                    >
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <Select
                      value={editingDoctor.category}
                      onChange={(e) => setEditingDoctor({ ...editingDoctor, category: e.target.value })}
                    >
                      {DOCTOR_CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={editingDoctor.active}
                        onChange={(e) => setEditingDoctor({ ...editingDoctor, active: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Weekday Workload
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={editingDoctor.workloadWeekday}
                      onChange={(e) => setEditingDoctor({ ...editingDoctor, workloadWeekday: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Weekend Workload
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={editingDoctor.workloadWeekend}
                      onChange={(e) => setEditingDoctor({ ...editingDoctor, workloadWeekend: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ED Workload
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={editingDoctor.workloadED}
                      onChange={(e) => setEditingDoctor({ ...editingDoctor, workloadED: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="mt-6 flex space-x-3">
                  <Button
                    onClick={() => updateDoctor(editingDoctor.id, editingDoctor)}
                    className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 font-semibold shadow-lg"
                  >
                    <span>Save Changes</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditingDoctor(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {viewingWorkload && (
              <div className="border rounded-lg p-6 mb-6 bg-blue-50">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Workload Details: {viewingWorkload.displayName}</h3>
                  <Button
                    variant="outline"
                    onClick={() => setViewingWorkload(null)}
                  >
                    Close
                  </Button>
                </div>
                <WorkloadDisplay 
                  doctorId={viewingWorkload.id}
                  doctorName={viewingWorkload.displayName}
                  showRefreshButton={true}
                />
              </div>
            )}

            {!showCreateForm && !editingDoctor && !viewingWorkload && (
              <>
                {doctors.length === 0 ? (
                  <div className="text-center py-8">
                    <User className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No doctors</h3>
                    <p className="mt-1 text-sm text-gray-500">Get started by adding a new doctor.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {doctors.map((doctor) => (
                      <div key={doctor.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="text-lg font-medium text-gray-900">{doctor.displayName}</h3>
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                doctor.category === 'SENIOR' ? 'bg-blue-100 text-blue-800' :
                                doctor.category === 'REGISTRAR' ? 'bg-purple-100 text-purple-800' :
                                doctor.category === 'JUNIOR' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {doctor.category.toLowerCase()}
                              </span>
                              {doctor.users ? (
                                <span className="flex items-center text-xs text-green-600">
                                  <UserCheck className="w-3 h-3 mr-1" />
                                  Has account
                                </span>
                              ) : (
                                <span className="text-xs text-red-600">No account</span>
                              )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                              <div className="flex items-center">
                                <Building className="w-4 h-4 mr-2" />
                                {doctor.units?.name || 'No unit assigned'}
                              </div>
                              {doctor.users && (
                                <div className="flex items-center">
                                  <Mail className="w-4 h-4 mr-2" />
                                  {doctor.users.email}
                                </div>
                              )}
                              <div className="text-xs">
                                Workload: {doctor.workloadWeekday}WD | {doctor.workloadWeekend}WE | {doctor.workloadED}ED
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewingWorkload(doctor)}
                              className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <TrendingUp className="w-4 h-4" />
                              <span>Workload</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingDoctor(doctor)}
                              className="flex items-center space-x-1"
                            >
                              <Edit className="w-4 h-4" />
                              <span>Edit</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteDoctor(doctor.id)}
                              className="flex items-center space-x-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}