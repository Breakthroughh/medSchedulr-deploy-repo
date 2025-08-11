"use client"

import { useSession } from "next-auth/react"
import { redirect } from "next/navigation"

export default function AdminAnalyticsPage() {
  const { data: session, status } = useSession()

  if (status === "loading") return <div>Loading...</div>
  if (!session || session.user.role !== "ADMIN") redirect("/auth/login")

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-2 text-gray-600">Coming soon - Schedule analytics and reporting</p>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="p-6">
            <p className="text-gray-500">Analytics functionality is under development.</p>
          </div>
        </div>
      </div>
    </div>
  )
}