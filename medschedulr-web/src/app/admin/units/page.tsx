"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Edit, Trash2, Users } from "lucide-react"

interface Unit {
  id: string
  name: string
  active: boolean
  _count?: {
    doctors: number
  }
}

export default function UnitsPage() {
  const { data: session, status } = useSession()
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [newUnitName, setNewUnitName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)

  if (status === "loading") return <div>Loading...</div>
  if (!session || session.user.role !== "ADMIN") redirect("/auth/login")

  useEffect(() => {
    fetchUnits()
  }, [])

  const fetchUnits = async () => {
    try {
      const response = await fetch('/api/admin/units')
      const data = await response.json()
      setUnits(data.units || [])
    } catch (error) {
      console.error('Error fetching units:', error)
    } finally {
      setLoading(false)
    }
  }

  const createUnit = async () => {
    if (!newUnitName.trim()) return

    setIsCreating(true)
    try {
      const response = await fetch('/api/admin/units', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newUnitName.trim() }),
      })

      if (response.ok) {
        setNewUnitName("")
        fetchUnits()
      }
    } catch (error) {
      console.error('Error creating unit:', error)
    } finally {
      setIsCreating(false)
    }
  }

  const updateUnit = async (id: string, name: string) => {
    try {
      const response = await fetch(`/api/admin/units/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      })

      if (response.ok) {
        setEditingUnit(null)
        fetchUnits()
      }
    } catch (error) {
      console.error('Error updating unit:', error)
    }
  }

  const deleteUnit = async (id: string) => {
    if (!confirm('Are you sure you want to delete this unit?')) return

    try {
      const response = await fetch(`/api/admin/units/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchUnits()
      }
    } catch (error) {
      console.error('Error deleting unit:', error)
    }
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
              <div className="h-4 bg-gray-200 rounded w-4/6"></div>
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
          <h1 className="text-3xl font-bold text-gray-900">Hospital Units</h1>
          <p className="mt-2 text-gray-600">Manage hospital departments and units</p>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-gray-900">Create New Unit</h2>
            </div>
            
            <div className="flex space-x-4">
              <Input
                type="text"
                placeholder="Enter unit name (e.g., Emergency Department)"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && createUnit()}
                className="flex-1"
              />
              <Button
                onClick={createUnit}
                disabled={isCreating || !newUnitName.trim()}
                className="flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>{isCreating ? 'Creating...' : 'Create Unit'}</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-white shadow rounded-lg">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-6">Existing Units</h2>
            
            {units.length === 0 ? (
              <div className="text-center py-8">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No units</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating a new unit.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {units.map((unit) => (
                  <div key={unit.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        {editingUnit?.id === unit.id ? (
                          <div className="flex items-center space-x-2">
                            <Input
                              type="text"
                              value={editingUnit.name}
                              onChange={(e) => setEditingUnit({ ...editingUnit, name: e.target.value })}
                              onKeyPress={(e) => e.key === 'Enter' && editingUnit.name.trim() && updateUnit(unit.id, editingUnit.name)}
                              className="flex-1"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={() => updateUnit(unit.id, editingUnit.name)}
                              disabled={!editingUnit.name.trim()}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingUnit(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <h3 className="text-lg font-medium text-gray-900">{unit.name}</h3>
                            <p className="text-sm text-gray-500">
                              {unit._count?.doctors || 0} doctors assigned
                            </p>
                          </div>
                        )}
                      </div>

                      {editingUnit?.id !== unit.id && (
                        <div className="flex items-center space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingUnit(unit)}
                            className="flex items-center space-x-1"
                          >
                            <Edit className="w-4 h-4" />
                            <span>Edit</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteUnit(unit.id)}
                            className="flex items-center space-x-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete</span>
                          </Button>
                        </div>
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