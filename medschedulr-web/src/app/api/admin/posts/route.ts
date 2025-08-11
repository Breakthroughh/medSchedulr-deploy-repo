import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const posts = await prisma.post_configs.findMany({
      orderBy: {
        name: 'asc'
      }
    })

    return NextResponse.json({ posts })
  } catch (error) {
    console.error('Error fetching posts:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name, type } = await request.json()

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: "Post name is required" }, { status: 400 })
    }

    if (!type || !['WEEKDAY', 'WEEKEND', 'BOTH'].includes(type)) {
      return NextResponse.json({ error: "Valid post type is required" }, { status: 400 })
    }

    // Check if post name already exists
    const existingPost = await prisma.post_configs.findFirst({
      where: {
        name: name.trim()
      }
    })

    if (existingPost) {
      return NextResponse.json({ error: "Post name already exists" }, { status: 400 })
    }

    const post = await prisma.post_configs.create({
      data: {
        id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name.trim(),
        type
      }
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "CREATE",
        resource: "PostConfig",
        resourceId: post.id,
        details: { name: post.name, type: post.type }
      }
    })

    return NextResponse.json({ post })
  } catch (error) {
    console.error('Error creating post:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}