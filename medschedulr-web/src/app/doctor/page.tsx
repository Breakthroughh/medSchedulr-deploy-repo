"use client"

import { useSession } from "next-auth/react"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ClipboardList, Calendar, User, Clock } from "lucide-react"

export default function DoctorDashboard() {
  const { data: session, status } = useSession()

  if (status === "loading") return <div>Loading...</div>
  if (!session || session.user.role !== "DOCTOR") redirect("/auth/login")

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Doctor Portal</h1>
          <p className="mt-2 text-gray-600">
            Welcome, {session.user.doctor?.displayName || "Doctor"}
          </p>
          <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500">
            <span className="flex items-center">
              <User className="w-4 h-4 mr-1" />
              {session.user.doctor?.category}
            </span>
            <span className="flex items-center">
              <Clock className="w-4 h-4 mr-1" />
              {session.user.doctor?.unit?.name}
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/doctor/availability" className="group">
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ClipboardList className="w-8 h-8 text-blue-500" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">My Availability</dt>
                      <dd className="text-lg font-medium text-gray-900 group-hover:text-blue-600 transition-colors">Request leave & set availability</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/doctor/schedule" className="group">
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Calendar className="w-8 h-8 text-green-500" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">My Schedule</dt>
                      <dd className="text-lg font-medium text-gray-900 group-hover:text-green-600 transition-colors">View your assignments</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <User className="w-8 h-8 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Profile</dt>
                    <dd className="text-lg font-medium text-gray-400">View your information</dd>
                    <dd className="text-xs text-gray-400 mt-1">Coming soon</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-white shadow rounded-lg">
          <div className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Info</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {session.user.doctor?.workloadWeekday || 0}
                </div>
                <div className="text-sm text-gray-500">Weekday Shifts</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {session.user.doctor?.workloadWeekend || 0}
                </div>
                <div className="text-sm text-gray-500">Weekend Shifts</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {session.user.doctor?.workloadED || 0}
                </div>
                <div className="text-sm text-gray-500">ED Shifts</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}