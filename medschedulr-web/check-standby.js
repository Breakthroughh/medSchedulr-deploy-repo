const { PrismaClient } = require('@prisma/client')

async function checkStandby() {
  const prisma = new PrismaClient()
  
  try {
    const standbyCount = await prisma.schedule_assignments.count({
      where: { postName: 'Standby Oncall' }
    })
    
    console.log(`🎯 Standby Oncall assignments: ${standbyCount}`)
    
    if (standbyCount > 0) {
      const assignments = await prisma.schedule_assignments.findMany({
        where: { postName: 'Standby Oncall' },
        include: { doctors: true }
      })
      
      console.log('📅 Standby Oncall assignments:')
      assignments.forEach(a => {
        console.log(`  ${a.date.toISOString().split('T')[0]}: ${a.doctors.displayName}`)
      })
    }
    
    // Also check total assignments
    const totalCount = await prisma.schedule_assignments.count()
    console.log(`📊 Total assignments: ${totalCount}`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkStandby()