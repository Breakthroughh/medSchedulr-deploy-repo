import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      hasDatabase: !!process.env.DATABASE_URL,
      hasNextAuth: !!process.env.NEXTAUTH_SECRET,
    })
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}