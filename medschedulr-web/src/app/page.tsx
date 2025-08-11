import { redirect } from "next/navigation"

export default function Home() {
  // Redirect to login page - all users must authenticate
  redirect("/auth/login")
}
