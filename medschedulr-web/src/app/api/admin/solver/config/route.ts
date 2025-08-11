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

    // Get the active configuration (should only be one)
    let config = await prisma.solver_configs.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' }
    })

    // If no active config exists, check for existing default config
    if (!config) {
      const existingDefault = await prisma.solver_configs.findUnique({
        where: { name: "default" }
      })
      
      if (existingDefault) {
        // Activate the existing default config
        config = await prisma.solver_configs.update({
          where: { id: existingDefault.id },
          data: { active: true }
        })
      } else {
        // Create new default config
        config = await prisma.solver_configs.create({
          data: {
            id: `solver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: "default",
            lambdaRest: 3,
            lambdaGap: 1,
            lambdaED: 6,
            lambdaStandby: 5,
            lambdaMinOne: 10,
            lambdaRegWeekend: 2,
            lambdaUnitOver: 25,
            lambdaJuniorWard: 6,
            clinicPenaltyBefore: 10,
            clinicPenaltySame: 50,
            clinicPenaltyAfter: 5,
            bigM: 10000,
            solverTimeoutSeconds: 600,
            active: true,
            updatedAt: new Date()
          }
        })
      }
    }

    return NextResponse.json({ config })
  } catch (error) {
    console.error('Error fetching solver config:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    // Validate required fields and types
    const requiredFields = [
      'lambdaRest', 'lambdaGap', 'lambdaED', 'lambdaStandby', 'lambdaMinOne',
      'lambdaRegWeekend', 'lambdaUnitOver', 'lambdaJuniorWard',
      'clinicPenaltyBefore', 'clinicPenaltySame', 'clinicPenaltyAfter',
      'bigM', 'solverTimeoutSeconds'
    ]

    for (const field of requiredFields) {
      if (typeof data[field] !== 'number' || data[field] < 0) {
        return NextResponse.json({ 
          error: `Invalid value for ${field}: must be a non-negative number` 
        }, { status: 400 })
      }
    }

    // Additional validation
    if (data.solverTimeoutSeconds < 60 || data.solverTimeoutSeconds > 3600) {
      return NextResponse.json({ 
        error: "Solver timeout must be between 60 and 3600 seconds" 
      }, { status: 400 })
    }

    if (data.bigM < 1000) {
      return NextResponse.json({ 
        error: "BigM must be at least 1000" 
      }, { status: 400 })
    }

    // Get current active config
    const currentConfig = await prisma.solver_configs.findFirst({
      where: { active: true }
    })

    if (!currentConfig) {
      return NextResponse.json({ error: "No active configuration found" }, { status: 404 })
    }

    // Update the configuration
    const updatedConfig = await prisma.solver_configs.update({
      where: { id: currentConfig.id },
      data: {
        lambdaRest: data.lambdaRest,
        lambdaGap: data.lambdaGap,
        lambdaED: data.lambdaED,
        lambdaStandby: data.lambdaStandby,
        lambdaMinOne: data.lambdaMinOne,
        lambdaRegWeekend: data.lambdaRegWeekend,
        lambdaUnitOver: data.lambdaUnitOver,
        lambdaJuniorWard: data.lambdaJuniorWard,
        clinicPenaltyBefore: data.clinicPenaltyBefore,
        clinicPenaltySame: data.clinicPenaltySame,
        clinicPenaltyAfter: data.clinicPenaltyAfter,
        bigM: data.bigM,
        solverTimeoutSeconds: data.solverTimeoutSeconds,
        updatedAt: new Date()
      }
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: session.user.id,
        action: "UPDATE",
        resource: "SolverConfig",
        resourceId: updatedConfig.id,
        details: {
          configName: updatedConfig.name,
          changes: data
        }
      }
    })

    return NextResponse.json({ config: updatedConfig })
  } catch (error) {
    console.error('Error updating solver config:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}