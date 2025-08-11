"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Settings, Save, RotateCcw, Info, Sliders, Target, Users, Calendar, Timer } from "lucide-react"

interface SolverConfig {
  id: string
  name: string
  lambdaRest: number
  lambdaGap: number
  lambdaED: number
  lambdaStandby: number
  lambdaMinOne: number
  lambdaRegWeekend: number
  lambdaUnitOver: number
  lambdaJuniorWard: number
  clinicPenaltyBefore: number
  clinicPenaltySame: number
  clinicPenaltyAfter: number
  bigM: number
  solverTimeoutSeconds: number
  active: boolean
  createdAt: string
  updatedAt: string
}

const DEFAULT_CONFIG = {
  lambdaRest: 3,
  lambdaGap: 1,
  lambdaED: 6,
  lambdaStandby: 5,
  lambdaMinOne: 10,
  lambdaRegWeekend: 2,
  lambdaUnitOver: 25,
  lambdaJuniorWard: 6,
  clinicPenaltyBefore: 10,
  clinicPenaltySame: 50,
  clinicPenaltyAfter: 5,
  bigM: 10000,
  solverTimeoutSeconds: 600
}

const PARAMETER_GROUPS = [
  {
    title: "Workload Balancing",
    icon: Users,
    description: "Controls fair distribution of work among doctors",
    parameters: [
      { key: 'lambdaRest', label: 'Rest Penalty Weight', min: 0, max: 10, step: 0.5, description: 'Penalty for insufficient rest between shifts' },
      { key: 'lambdaGap', label: 'Gap Penalty Weight', min: 0, max: 10, step: 0.5, description: 'Penalty for gaps in coverage' },
      { key: 'lambdaMinOne', label: 'Minimum Coverage Weight', min: 0, max: 20, step: 1, description: 'Ensure minimum one doctor per shift' }
    ]
  },
  {
    title: "Emergency Department",
    icon: Target,
    description: "Special handling for ED shifts and standby coverage",
    parameters: [
      { key: 'lambdaED', label: 'ED Assignment Weight', min: 0, max: 15, step: 1, description: 'Priority for ED shift assignments' },
      { key: 'lambdaStandby', label: 'Standby Coverage Weight', min: 0, max: 15, step: 1, description: 'Weight for standby shift coverage' }
    ]
  },
  {
    title: "Weekend & Unit Coverage",
    icon: Calendar,
    description: "Weekend fairness and unit-specific preferences",
    parameters: [
      { key: 'lambdaRegWeekend', label: 'Weekend Fairness Weight', min: 0, max: 10, step: 0.5, description: 'Fair distribution of weekend shifts' },
      { key: 'lambdaUnitOver', label: 'Unit Over-Coverage Weight', min: 0, max: 50, step: 5, description: 'Penalty for exceeding unit capacity' },
      { key: 'lambdaJuniorWard', label: 'Junior Ward Assignment Weight', min: 0, max: 15, step: 1, description: 'Preference for junior doctors on ward shifts' }
    ]
  },
  {
    title: "Clinic Scheduling",
    icon: Sliders,
    description: "Penalties for clinic scheduling conflicts",
    parameters: [
      { key: 'clinicPenaltyBefore', label: 'Pre-Clinic Penalty', min: 0, max: 20, step: 1, description: 'Penalty for shifts before clinic days' },
      { key: 'clinicPenaltySame', label: 'Same-Day Clinic Penalty', min: 0, max: 100, step: 5, description: 'Penalty for shifts on clinic days' },
      { key: 'clinicPenaltyAfter', label: 'Post-Clinic Penalty', min: 0, max: 20, step: 1, description: 'Penalty for shifts after clinic days' }
    ]
  },
  {
    title: "Algorithm Settings",
    icon: Settings,
    description: "Technical parameters for the optimization solver",
    parameters: [
      { key: 'bigM', label: 'Big M Parameter', min: 1000, max: 50000, step: 1000, description: 'Large number for constraint enforcement' },
      { key: 'solverTimeoutSeconds', label: 'Timeout (seconds)', min: 10, max: 3600, step: 30, description: 'Maximum time for solver to run' }
    ]
  }
]

export default function SolverConfigPage() {
  const { data: session, status } = useSession()
  const [config, setConfig] = useState<SolverConfig | null>(null)
  const [parameters, setParameters] = useState(DEFAULT_CONFIG)
  const [originalParameters, setOriginalParameters] = useState(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  if (status === "loading") return <div>Loading...</div>
  if (!session || session.user.role !== "ADMIN") redirect("/auth/login")

  useEffect(() => {
    fetchConfig()
  }, [])

  useEffect(() => {
    const hasChanges = JSON.stringify(parameters) !== JSON.stringify(originalParameters)
    setHasUnsavedChanges(hasChanges)
  }, [parameters, originalParameters])

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/admin/solver/config')
      const data = await response.json()
      if (data.config) {
        setConfig(data.config)
        const configParams = {
          lambdaRest: data.config.lambdaRest,
          lambdaGap: data.config.lambdaGap,
          lambdaED: data.config.lambdaED,
          lambdaStandby: data.config.lambdaStandby,
          lambdaMinOne: data.config.lambdaMinOne,
          lambdaRegWeekend: data.config.lambdaRegWeekend,
          lambdaUnitOver: data.config.lambdaUnitOver,
          lambdaJuniorWard: data.config.lambdaJuniorWard,
          clinicPenaltyBefore: data.config.clinicPenaltyBefore,
          clinicPenaltySame: data.config.clinicPenaltySame,
          clinicPenaltyAfter: data.config.clinicPenaltyAfter,
          bigM: data.config.bigM,
          solverTimeoutSeconds: data.config.solverTimeoutSeconds
        }
        setParameters(configParams)
        setOriginalParameters(configParams)
      } else {
        setParameters(DEFAULT_CONFIG)
        setOriginalParameters(DEFAULT_CONFIG)
      }
    } catch (error) {
      console.error('Error fetching solver config:', error)
      setParameters(DEFAULT_CONFIG)
      setOriginalParameters(DEFAULT_CONFIG)
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/solver/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parameters),
      })

      if (response.ok) {
        const data = await response.json()
        setConfig(data.config)
        setOriginalParameters(parameters)
        setHasUnsavedChanges(false)
        alert('Configuration saved successfully!')
      } else {
        const error = await response.json()
        alert(error.error || 'Error saving configuration')
      }
    } catch (error) {
      console.error('Error saving config:', error)
      alert('Error saving configuration')
    } finally {
      setSaving(false)
    }
  }

  const resetToDefaults = () => {
    if (confirm('Are you sure you want to reset all parameters to default values?')) {
      setParameters(DEFAULT_CONFIG)
    }
  }

  const updateParameter = (key: string, value: number) => {
    setParameters(prev => ({
      ...prev,
      [key]: value
    }))
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
          <h1 className="text-3xl font-bold text-gray-900">Solver Configuration</h1>
          <p className="mt-2 text-gray-600">Adjust scheduling algorithm parameters and weights</p>
        </div>

        {/* Save Controls */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Configuration Status</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {config ? `Last updated: ${new Date(config.updatedAt).toLocaleString()}` : 'No configuration saved yet'}
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  onClick={resetToDefaults}
                  className="flex items-center space-x-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset to Defaults</span>
                </Button>
                <Button
                  onClick={saveConfig}
                  disabled={saving || !hasUnsavedChanges}
                  className={`flex items-center space-x-2 px-6 py-2 font-semibold shadow-lg transition-all duration-200 ${
                    hasUnsavedChanges
                      ? 'bg-orange-600 hover:bg-orange-700 text-white border-2 border-orange-600 animate-pulse'
                      : 'bg-green-600 hover:bg-green-700 text-white border-2 border-green-600'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Saved'}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Parameter Groups */}
        <div className="space-y-8">
          {PARAMETER_GROUPS.map((group) => {
            const Icon = group.icon
            return (
              <div key={group.title} className="bg-white shadow rounded-lg">
                <div className="p-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <Icon className="w-6 h-6 text-blue-600" />
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">{group.title}</h3>
                      <p className="text-sm text-gray-500">{group.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {group.parameters.map((param) => (
                      <div key={param.key} className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <label className="block text-sm font-medium text-gray-700">
                            {param.label}
                          </label>
                          <div className="relative group">
                            <Info className="w-4 h-4 text-gray-400 cursor-help" />
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                              {param.description}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Input
                            type="number"
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            value={parameters[param.key as keyof typeof parameters]}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value)
                              updateParameter(param.key, value)
                            }}
                            className="w-24"
                          />
                          <input
                            type="range"
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            value={parameters[param.key as keyof typeof parameters]}
                            onChange={(e) => updateParameter(param.key, parseFloat(e.target.value))}
                            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                          />
                          <span className="text-xs text-gray-500 w-16 text-right">
                            {param.min} - {param.max}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Help Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8">
          <div className="flex items-start space-x-3">
            <Info className="w-6 h-6 text-blue-600 mt-0.5" />
            <div>
              <h3 className="text-lg font-medium text-blue-900 mb-2">Configuration Guidelines</h3>
              <div className="text-sm text-blue-800 space-y-2">
                <p><strong>Lambda Weights:</strong> Higher values increase the penalty for violating that constraint. Balance all weights carefully.</p>
                <p><strong>Clinic Penalties:</strong> Control scheduling around clinic days. Higher same-day penalties prevent conflicts.</p>
                <p><strong>Big M:</strong> Large constraint enforcement parameter. Usually doesn't need adjustment unless solver issues occur.</p>
                <p><strong>Timeout:</strong> Maximum solver runtime. Increase for complex schedules, decrease for faster (potentially suboptimal) results.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}