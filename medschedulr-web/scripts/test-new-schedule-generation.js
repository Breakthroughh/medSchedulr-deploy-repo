const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('🔄 Testing new schedule generation with updated logic...')

  // Clear existing schedule assignments for oncall-test-period to start fresh
  const rosterPeriod = await prisma.rosterPeriod.findUnique({
    where: { id: 'oncall-test-period' }
  })

  if (!rosterPeriod) {
    console.log('❌ oncall-test-period not found')
    return
  }

  // Delete existing assignments
  await prisma.scheduleAssignment.deleteMany({
    where: { rosterPeriodId: rosterPeriod.id }
  })

  console.log('✅ Cleared existing assignments')

  // Now we need to trigger a new schedule generation
  console.log('📋 To test the updated scheduler:')
  console.log('1. Navigate to http://localhost:3000/admin/schedules')
  console.log('2. Click "Generate Schedule" for "OnCall Posts Test Period"')
  console.log('3. Run the analysis script: node scripts/test-schedule-results.js')
  console.log('')
  console.log('Expected improvements:')
  console.log('✅ Standby Oncall should assign SAME doctor for Saturday + Sunday')
  console.log('✅ Ward 6 and ED2 weekend posts should now be allocated')
  console.log('✅ Weekend posts should have consistent assignments')
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })