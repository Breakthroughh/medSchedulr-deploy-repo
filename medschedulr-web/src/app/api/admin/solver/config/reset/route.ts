import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get current active config
    const currentConfig = await prisma.solverConfig.findFirst({
      where: { active: true }
    })

    if (!currentConfig) {
      return NextResponse.json({ error: "No active configuration found" }, { status: 404 })
    }

    // Reset to default values
    const resetConfig = await prisma.solverConfig.update({
      where: { id: currentConfig.id },
      data: {
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
        updatedAt: new Date()
      }
    })

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "RESET",
        resource: "SolverConfig",
        resourceId: resetConfig.id,
        details: {
          configName: resetConfig.name,
          action: "Reset to default values"
        }
      }
    })

    return NextResponse.json({ 
      config: resetConfig,
      message: "Configuration reset to default values"
    })
  } catch (error) {
    console.error('Error resetting solver config:', error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}