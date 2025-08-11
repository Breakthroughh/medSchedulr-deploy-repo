"use client"

import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { LogOut, User, Calendar, Settings, Users, ClipboardList, Sliders } from "lucide-react"

export function Navbar() {
  const { data: session, status } = useSession()

  const handleSignOut = () => {
    signOut({ callbackUrl: "/auth/login" })
  }

  if (status === "loading") {
    return (
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-gray-900">MedSchedulr</h1>
            </div>
            <div className="animate-pulse bg-gray-200 h-8 w-20 rounded"></div>
          </div>
        </div>
      </nav>
    )
  }

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <div className="flex-shrink-0">
              <Link href={session?.user.role === "ADMIN" ? "/admin" : "/doctor"}>
                <h1 className="text-xl font-bold text-blue-600 hover:text-blue-700 transition-colors">
                  MedSchedulr
                </h1>
              </Link>
            </div>

            {session && (
              <div className="hidden md:flex items-center space-x-4">
                {session.user.role === "ADMIN" ? (
                  // Admin Navigation
                  <>
                    <Link 
                      href="/admin"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1 hover:bg-gray-100 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Dashboard</span>
                    </Link>
                    <Link 
                      href="/admin/units"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1 hover:bg-gray-100 transition-colors"
                    >
                      <Users className="w-4 h-4" />
                      <span>Units</span>
                    </Link>
                    <Link 
                      href="/admin/doctors"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1 hover:bg-gray-100 transition-colors"
                    >
                      <User className="w-4 h-4" />
                      <span>Doctors</span>
                    </Link>
                    <Link 
                      href="/admin/schedules"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1 hover:bg-gray-100 transition-colors"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Schedules</span>
                    </Link>
                    <Link 
                      href="/admin/availability"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1 hover:bg-gray-100 transition-colors"
                    >
                      <ClipboardList className="w-4 h-4" />
                      <span>Requests</span>
                    </Link>
                    <Link 
                      href="/admin/solver"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1 hover:bg-gray-100 transition-colors"
                    >
                      <Sliders className="w-4 h-4" />
                      <span>Solver</span>
                    </Link>
                  </>
                ) : (
                  // Doctor Navigation
                  <>
                    <Link 
                      href="/doctor"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1 hover:bg-gray-100 transition-colors"
                    >
                      <User className="w-4 h-4" />
                      <span>Dashboard</span>
                    </Link>
                    <Link 
                      href="/doctor/availability"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1 hover:bg-gray-100 transition-colors"
                    >
                      <ClipboardList className="w-4 h-4" />
                      <span>My Availability</span>
                    </Link>
                    <Link 
                      href="/doctor/schedule"
                      className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-1 hover:bg-gray-100 transition-colors"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>My Schedule</span>
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {session ? (
              <div className="flex items-center space-x-4">
                <div className="hidden md:flex flex-col text-right text-sm">
                  <span className="font-medium text-gray-900">
                    {session.user.doctor?.displayName || session.user.email}
                  </span>
                  <span className="text-gray-500">
                    {session.user.role === "ADMIN" ? "Administrator" : 
                     `${session.user.doctor?.category} • ${session.user.doctor?.unit?.name}`}
                  </span>
                </div>
                <Button
                  onClick={handleSignOut}
                  variant="outline"
                  size="sm"
                  className="flex items-center space-x-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log out</span>
                </Button>
              </div>
            ) : (
              <Link href="/auth/login">
                <Button size="sm">
                  Log in
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Mobile menu */}
        {session && (
          <div className="md:hidden border-t border-gray-200 py-2">
            <div className="flex flex-wrap gap-2">
              {session.user.role === "ADMIN" ? (
                <>
                  <Link href="/admin" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded text-sm">Dashboard</Link>
                  <Link href="/admin/units" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded text-sm">Units</Link>
                  <Link href="/admin/doctors" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded text-sm">Doctors</Link>
                  <Link href="/admin/schedules" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded text-sm">Schedules</Link>
                  <Link href="/admin/availability" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded text-sm">Requests</Link>
                  <Link href="/admin/solver" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded text-sm">Solver</Link>
                </>
              ) : (
                <>
                  <Link href="/doctor" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded text-sm">Dashboard</Link>
                  <Link href="/doctor/availability" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded text-sm">My Availability</Link>
                  <Link href="/doctor/schedule" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded text-sm">My Schedule</Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}