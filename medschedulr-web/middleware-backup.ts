import { withAuth } from "next-auth/middleware"

export default withAuth(
  function middleware(req) {
    // Add any additional middleware logic here
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl
        
        // Allow access to auth pages and API routes
        if (pathname.startsWith("/auth") || pathname.startsWith("/api/auth") || pathname === "/api/test-db" || pathname === "/api/health" || pathname === "/test" || pathname === "/simple") {
          return true
        }
        
        // Require authentication for all other pages
        if (!token) return false
        
        // Check role-based access
        if (pathname.startsWith("/admin")) {
          return token.role === "ADMIN"
        }
        
        if (pathname.startsWith("/doctor")) {
          return token.role === "DOCTOR"
        }
        
        return true
      },
    },
  }
)

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
}