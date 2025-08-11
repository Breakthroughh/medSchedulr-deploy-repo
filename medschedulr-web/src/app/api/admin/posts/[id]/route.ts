import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = params

    // Check if post exists
    const post = await prisma.post_configs.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            availability: true,
            assignments: true
          }
        }
      }
    })

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 })
    }

    // Check if post has any availability requests or assignments
    if (post._count.availability > 0 || post._count.assignments > 0) {
      return NextResponse.json({ 
        error: "Cannot delete post with existing availability requests or schedule assignments. Please remove these first." 
      }, { status: 400 })
    }

    await prisma.post_configs.delete({
      where: { id }
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "DELETE",
        resource: "PostConfig",
        resourceId: id,
        details: { name: post.name, type: post.type }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting post:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}