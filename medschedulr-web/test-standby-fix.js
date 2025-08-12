const { PrismaClient } = require('@prisma/client')

async function testStandbyFix() {
  const prisma = new PrismaClient()
  
  try {
    // Find the latest roster period
    const rosterPeriod = await prisma.rosterPeriod.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { schedule_assignments: true }
        }
      }
    })
    
    if (!rosterPeriod) {
      console.log('❌ No roster periods found')
      return
    }
    
    console.log(`📋 Testing with roster period: ${rosterPeriod.name}`)
    console.log(`📊 Current assignments: ${rosterPeriod._count.schedule_assignments}`)
    
    // Check if we have Standby Oncall post configured
    const standbyPost = await prisma.post_configs.findFirst({
      where: { name: 'Standby Oncall', active: true }
    })
    
    if (!standbyPost) {
      console.log('❌ Standby Oncall post not found or not active')
      return
    }
    
    console.log(`✅ Standby Oncall post found: ${standbyPost.name} (${standbyPost.type})`)
    
    // Check availability slots for Standby Oncall
    const standbyAvailability = await prisma.availability.count({
      where: {
        rosterPeriodId: rosterPeriod.id,
        postConfigId: standbyPost.id
      }
    })
    
    console.log(`📋 Standby Oncall availability slots: ${standbyAvailability}`)
    
    if (standbyAvailability === 0) {
      console.log('⚠️  No availability slots found for Standby Oncall - this might be the issue!')
      console.log('💡 Try creating a new roster period to generate all availability slots')
      return
    }
    
    console.log('')
    console.log('🚀 To test the fix:')
    console.log('1. Navigate to http://localhost:3000/admin/schedules')
    console.log(`2. Generate a new schedule for "${rosterPeriod.name}"`)
    console.log('3. Check the console logs for post-processing messages')
    console.log('4. Run: node check-standby.js')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

testStandbyFix()