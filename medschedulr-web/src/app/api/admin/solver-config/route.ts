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

    // Get the active solver configuration
    const config = await prisma.solver_configs.findFirst({
      where: {
        active: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    return NextResponse.json({ config })
  } catch (error) {
    console.error('Error fetching solver config:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      name,
      lambdaRest,
      lambdaGap,
      lambdaED,
      lambdaStandby,
      lambdaMinOne,
      lambdaRegWeekend,
      lambdaUnitOver,
      lambdaJuniorWard,
      clinicPenaltyBefore,
      clinicPenaltySame,
      clinicPenaltyAfter,
      bigM,
      solverTimeoutSeconds
    } = await request.json()

    // Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: "Configuration name is required" }, { status: 400 })
    }

    // Validate numeric parameters
    const numericParams = {
      lambdaRest, lambdaGap, lambdaED, lambdaStandby, lambdaMinOne,
      lambdaRegWeekend, lambdaUnitOver, lambdaJuniorWard,
      clinicPenaltyBefore, clinicPenaltySame, clinicPenaltyAfter,
      bigM, solverTimeoutSeconds
    }

    for (const [key, value] of Object.entries(numericParams)) {
      if (typeof value !== 'number' || value < 0) {
        return NextResponse.json({ 
          error: `${key} must be a non-negative number` 
        }, { status: 400 })
      }
    }

    if (solverTimeoutSeconds < 10 || solverTimeoutSeconds > 3600) {
      return NextResponse.json({ 
        error: "Solver timeout must be between 10 and 3600 seconds" 
      }, { status: 400 })
    }

    // Deactivate existing active configs
    await prisma.solver_configs.updateMany({
      where: {
        active: true
      },
      data: {
        active: false
      }
    })

    // Create new configuration
    const config = await prisma.solver_configs.create({
      data: {
        name: name.trim(),
        lambdaRest,
        lambdaGap,
        lambdaED,
        lambdaStandby,
        lambdaMinOne,
        lambdaRegWeekend,
        lambdaUnitOver,
        lambdaJuniorWard,
        clinicPenaltyBefore,
        clinicPenaltySame,
        clinicPenaltyAfter,
        bigM,
        solverTimeoutSeconds,
        active: true
      }
    })

    // Audit log
    await prisma.audit_logs.create({
      data: {
        userId: session.user.id,
        action: "CREATE",
        resource: "SolverConfig",
        resourceId: config.id,
        details: {
          name: config.name,
          lambdaRest,
          lambdaGap,
          lambdaED,
          lambdaStandby,
          lambdaMinOne,
          lambdaRegWeekend,
          lambdaUnitOver,
          lambdaJuniorWard,
          clinicPenaltyBefore,
          clinicPenaltySame,
          clinicPenaltyAfter,
          bigM,
          solverTimeoutSeconds
        }
      }
    })

    return NextResponse.json({ config })
  } catch (error) {
    console.error('Error creating solver config:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}