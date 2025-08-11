"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Calendar, Settings, Plus, Edit, Trash2, Save } from "lucide-react"

interface Unit {
  id: string
  name: string
  clinicDays: Array<{ weekday: number }>
}

interface PostConfig {
  id: string
  name: string
  type: string
  active: boolean
}

const WEEKDAYS = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' }
]

const POST_TYPES = [
  { value: 'WEEKDAY', label: 'Weekday Only' },
  { value: 'WEEKEND', label: 'Weekend Only' },
  { value: 'BOTH', label: 'Both Weekday & Weekend' }
]

export default function PostsConfigPage() {
  const { data: session, status } = useSession()
  const [units, setUnits] = useState<Unit[]>([])
  const [posts, setPosts] = useState<PostConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'clinic' | 'posts'>('clinic')
  
  // Clinic days management
  const [clinicChanges, setClinicChanges] = useState<{[unitId: string]: number[]}>({})
  const [originalClinicDays, setOriginalClinicDays] = useState<{[unitId: string]: number[]}>({})
  
  // Post management
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [newPostName, setNewPostName] = useState('')
  const [newPostType, setNewPostType] = useState('BOTH')
  const [isCreatingPost, setIsCreatingPost] = useState(false)

  if (status === "loading") return <div>Loading...</div>
  if (!session || session.user.role !== "ADMIN") redirect("/auth/login")

  useEffect(() => {
    fetchUnits()
    fetchPosts()
  }, [])

  const fetchUnits = async () => {
    try {
      const response = await fetch('/api/admin/units/clinic-days')
      const data = await response.json()
      setUnits(data.units || [])
      
      // Initialize clinic changes with current values
      const changes: {[unitId: string]: number[]} = {}
      const original: {[unitId: string]: number[]} = {}
      data.units?.forEach((unit: Unit) => {
        const weekdays = unit.clinicDays.map(cd => cd.weekday)
        changes[unit.id] = weekdays
        original[unit.id] = weekdays
      })
      setClinicChanges(changes)
      setOriginalClinicDays(original)
    } catch (error) {
      console.error('Error fetching units:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPosts = async () => {
    try {
      const response = await fetch('/api/admin/posts')
      const data = await response.json()
      setPosts(data.posts || [])
    } catch (error) {
      console.error('Error fetching posts:', error)
    }
  }

  const toggleClinicDay = (unitId: string, weekday: number) => {
    setClinicChanges(prev => {
      const current = prev[unitId] || []
      const updated = current.includes(weekday)
        ? current.filter(d => d !== weekday)
        : [...current, weekday].sort()
      return { ...prev, [unitId]: updated }
    })
  }

  const saveClinicDays = async (unitId: string) => {
    try {
      const response = await fetch(`/api/admin/units/${unitId}/clinic-days`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ weekdays: clinicChanges[unitId] || [] }),
      })

      if (response.ok) {
        // Update original to match current (no more unsaved changes)
        setOriginalClinicDays(prev => ({ ...prev, [unitId]: clinicChanges[unitId] || [] }))
        fetchUnits()
      } else {
        const error = await response.json()
        alert(error.error || 'Error saving clinic days')
      }
    } catch (error) {
      console.error('Error saving clinic days:', error)
      alert('Error saving clinic days')
    }
  }

  const hasUnsavedChanges = (unitId: string) => {
    const current = clinicChanges[unitId] || []
    const original = originalClinicDays[unitId] || []
    return JSON.stringify(current.sort()) !== JSON.stringify(original.sort())
  }

  // Helper functions to categorize posts
  const getWeekdayPosts = () => posts.filter(post => post.type === 'WEEKDAY' || post.type === 'BOTH')
  const getWeekendPosts = () => posts.filter(post => post.type === 'WEEKEND' || post.type === 'BOTH')

  const createPost = async () => {
    if (!newPostName.trim()) return

    setIsCreatingPost(true)
    try {
      const response = await fetch('/api/admin/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newPostName.trim(),
          type: newPostType
        }),
      })

      if (response.ok) {
        setNewPostName('')
        setNewPostType('BOTH')
        setShowCreatePost(false)
        fetchPosts()
      } else {
        const error = await response.json()
        alert(error.error || 'Error creating post')
      }
    } catch (error) {
      console.error('Error creating post:', error)
      alert('Error creating post')
    } finally {
      setIsCreatingPost(false)
    }
  }

  const deletePost = async (id: string, postName: string) => {
    if (postName === 'Standby Oncall') {
      alert('Standby Oncall is a permanent post and cannot be deleted.')
      return
    }

    if (!confirm(`Are you sure you want to delete "${postName}"?`)) return

    try {
      const response = await fetch(`/api/admin/posts/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchPosts()
      } else {
        const error = await response.json()
        alert(error.error || 'Error deleting post')
      }
    } catch (error) {
      console.error('Error deleting post:', error)
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
          <h1 className="text-3xl font-bold text-gray-900">Posts & Configuration</h1>
          <p className="mt-2 text-gray-600">Configure clinic days and on-call posts</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('clinic')}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'clinic'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Calendar className="w-4 h-4 inline mr-2" />
              Clinic Days
            </button>
            <button
              onClick={() => setActiveTab('posts')}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'posts'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Settings className="w-4 h-4 inline mr-2" />
              On-Call Posts
            </button>
          </nav>
        </div>

        {activeTab === 'clinic' && (
          <div className="bg-white shadow rounded-lg">
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">Clinic Days Configuration</h2>
              <p className="text-sm text-gray-600 mb-6">
                Set which weekdays each unit has clinic days. Doctors will be automatically assigned to clinic on these days.
              </p>
              
              <div className="space-y-6">
                {units.map((unit) => (
                  <div key={unit.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">{unit.name}</h3>
                      <Button
                        onClick={() => saveClinicDays(unit.id)}
                        size="sm"
                        className={`flex items-center space-x-2 px-6 py-2 font-semibold shadow-lg transition-all duration-200 ${
                          hasUnsavedChanges(unit.id)
                            ? 'bg-orange-600 hover:bg-orange-700 text-white border-2 border-orange-600 animate-pulse'
                            : 'bg-green-600 hover:bg-green-700 text-white border-2 border-green-600'
                        }`}
                      >
                        <Save className="w-4 h-4" />
                        <span>{hasUnsavedChanges(unit.id) ? 'Save Changes' : 'Saved'}</span>
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                      {WEEKDAYS.map((day) => (
                        <label key={day.value} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(clinicChanges[unit.id] || []).includes(day.value)}
                            onChange={() => toggleClinicDay(unit.id, day.value)}
                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          />
                          <span className="text-sm text-gray-700">{day.label}</span>
                        </label>
                      ))}
                    </div>
                    
                    <div className="mt-2 text-xs text-gray-500">
                      Currently: {(clinicChanges[unit.id] || []).length === 0 
                        ? 'No clinic days' 
                        : (clinicChanges[unit.id] || []).map(d => WEEKDAYS.find(w => w.value === d)?.label).join(', ')
                      }
                    </div>
                  </div>
                ))}
                
                {units.length === 0 && (
                  <div className="text-center py-8">
                    <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No units found</h3>
                    <p className="mt-1 text-sm text-gray-500">Create units first to configure clinic days.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'posts' && (
          <div className="bg-white shadow rounded-lg">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-gray-900">On-Call Posts</h2>
                {!showCreatePost ? (
                  <Button
                    onClick={() => setShowCreatePost(true)}
                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 shadow-lg"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Add Post</span>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCreatePost(false)
                      setNewPostName('')
                      setNewPostType('BOTH')
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              
              {showCreatePost && (
                <div className="border rounded-lg p-4 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Post Name
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g., ED1, Ward3, Standby Oncall"
                        value={newPostName}
                        onChange={(e) => setNewPostName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && newPostName.trim() && createPost()}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Schedule Type
                      </label>
                      <Select
                        value={newPostType}
                        onChange={(e) => setNewPostType(e.target.value)}
                      >
                        {POST_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button
                      onClick={createPost}
                      disabled={isCreatingPost || !newPostName.trim()}
                      className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg font-semibold shadow-lg border-2 border-green-600"
                    >
                      <Plus className="w-5 h-5" />
                      <span>{isCreatingPost ? 'Creating...' : 'Create Post'}</span>
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-8">
                {/* Weekday Posts */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Calendar className="w-5 h-5 mr-2 text-blue-600" />
                    Weekday Posts
                  </h3>
                  <div className="space-y-3">
                    {getWeekdayPosts().map((post) => (
                      <div key={post.id} className="border rounded-lg p-4 hover:bg-gray-50 bg-blue-50 border-blue-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-lg font-medium text-gray-900">{post.name}</h4>
                            <p className="text-sm text-gray-500">
                              {POST_TYPES.find(t => t.value === post.type)?.label || post.type}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            {post.name !== 'Standby Oncall' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deletePost(post.id, post.name)}
                                className="flex items-center space-x-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>Delete</span>
                              </Button>
                            ) : (
                              <div className="px-3 py-1 bg-amber-100 text-amber-800 text-sm rounded border border-amber-300">
                                Permanent Post
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {getWeekdayPosts().length === 0 && (
                      <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                        <p>No weekday posts configured</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Weekend Posts */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Calendar className="w-5 h-5 mr-2 text-purple-600" />
                    Weekend Posts
                  </h3>
                  <div className="space-y-3">
                    {getWeekendPosts().map((post) => (
                      <div key={post.id} className="border rounded-lg p-4 hover:bg-gray-50 bg-purple-50 border-purple-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-lg font-medium text-gray-900">{post.name}</h4>
                            <p className="text-sm text-gray-500">
                              {POST_TYPES.find(t => t.value === post.type)?.label || post.type}
                            </p>
                            {post.name === 'Standby Oncall' && (
                              <p className="text-xs text-amber-600 font-medium mt-1">2-day weekend shift</p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            {post.name !== 'Standby Oncall' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deletePost(post.id, post.name)}
                                className="flex items-center space-x-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>Delete</span>
                              </Button>
                            ) : (
                              <div className="px-3 py-1 bg-amber-100 text-amber-800 text-sm rounded border border-amber-300">
                                Permanent Post
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {getWeekendPosts().length === 0 && (
                      <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                        <p>No weekend posts configured</p>
                      </div>
                    )}
                  </div>
                </div>
                
                {posts.length === 0 && (
                  <div className="text-center py-8">
                    <Settings className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No posts configured</h3>
                    <p className="mt-1 text-sm text-gray-500">Create your first on-call post to get started.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}