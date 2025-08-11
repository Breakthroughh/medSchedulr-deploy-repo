"use client"

import { useSession } from "next-auth/react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Users, User, Calendar, ClipboardList, Settings, TrendingUp } from "lucide-react"

export default function AdminDashboard() {
  const { data: session, status } = useSession()

  if (status === "loading") return <div>Loading...</div>
  if (!session || session.user.role !== "ADMIN") redirect("/auth/login")

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-2 text-gray-600">Hospital Scheduling System - Administrator Panel</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/admin/units" className="group">
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Users className="w-8 h-8 text-blue-500" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Units</dt>
                      <dd className="text-lg font-medium text-gray-900 group-hover:text-blue-600 transition-colors">Manage hospital units</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/admin/doctors" className="group">
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <User className="w-8 h-8 text-green-500" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Doctors</dt>
                      <dd className="text-lg font-medium text-gray-900 group-hover:text-green-600 transition-colors">Manage doctor profiles</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/admin/schedules" className="group">
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Calendar className="w-8 h-8 text-purple-500" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Schedules</dt>
                      <dd className="text-lg font-medium text-gray-900 group-hover:text-purple-600 transition-colors">Generate & manage schedules</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/admin/availability" className="group">
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ClipboardList className="w-8 h-8 text-orange-500" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Availability Requests</dt>
                      <dd className="text-lg font-medium text-gray-900 group-hover:text-orange-600 transition-colors">Review doctor requests</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/admin/posts" className="group">
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Settings className="w-8 h-8 text-gray-500" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Posts & Config</dt>
                      <dd className="text-lg font-medium text-gray-900 group-hover:text-gray-600 transition-colors">Configure posts & solver</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/admin/analytics" className="group">
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <TrendingUp className="w-8 h-8 text-indigo-500" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Analytics</dt>
                      <dd className="text-lg font-medium text-gray-900 group-hover:text-indigo-600 transition-colors">View reports & statistics</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}