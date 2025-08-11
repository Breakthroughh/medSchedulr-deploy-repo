import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    })

    if (existingAdmin) {
      return NextResponse.json({ 
        error: 'Admin user already exists' 
      }, { status: 400 })
    }

    // Create admin user with hashed password
    const hashedPassword = await bcrypt.hash('admin123', 10)
    
    const admin = await prisma.user.create({
      data: {
        email: 'admin@medschedulr.com',
        name: 'Admin User',
        password: hashedPassword,
        role: 'ADMIN'
      }
    })

    return NextResponse.json({ 
      message: 'Admin user created successfully',
      email: admin.email,
      password: 'admin123' // Only show in response for testing
    })
  } catch (error) {
    console.error('Error creating admin:', error)
    return NextResponse.json({ 
      error: 'Failed to create admin user' 
    }, { status: 500 })
  }
}