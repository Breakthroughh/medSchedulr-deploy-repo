const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('🔄 Adding availability for missing weekend posts...')

  // Get the oncall-test-period
  const rosterPeriod = await prisma.rosterPeriod.findUnique({
    where: { id: 'oncall-test-period' }
  })

  if (!rosterPeriod) {
    console.log('❌ oncall-test-period not found')
    return
  }

  // Get doctors
  const doctors = await prisma.doctor.findMany()
  
  // Get missing weekend posts (Ward 6 and ED2)
  const missingPosts = await prisma.postConfig.findMany({
    where: { 
      name: { in: ['Ward 6', 'ED2'] },
      active: true 
    }
  })

  console.log(`📋 Found ${doctors.length} doctors and ${missingPosts.length} missing weekend posts`)

  // Create availability for missing posts
  let recordCount = 0
  const dates = []
  const currentDate = new Date(rosterPeriod.startDate)
  while (currentDate <= rosterPeriod.endDate) {
    dates.push(new Date(currentDate))
    currentDate.setDate(currentDate.getDate() + 1)
  }

  for (const date of dates) {
    if (date.getDay() === 0 || date.getDay() === 6) { // Weekend days only
      for (const doctor of doctors) {
        for (const post of missingPosts) {
          // Check if availability already exists
          const existing = await prisma.availability.findFirst({
            where: {
              doctorId: doctor.id,
              rosterPeriodId: rosterPeriod.id,
              postConfigId: post.id,
              date: date
            }
          })

          if (!existing) {
            // Create availability with high probability
            await prisma.availability.create({
              data: {
                doctorId: doctor.id,
                rosterPeriodId: rosterPeriod.id,
                postConfigId: post.id,
                date: date,
                available: Math.random() > 0.2, // 80% available
                status: 'REQUESTED'
              }
            })
            recordCount++
          }
        }
      }
    }
  }

  console.log(`✅ Added ${recordCount} availability records for missing weekend posts`)
  console.log('🎉 Ready to test schedule generation again!')
}

main()
  .catch((e) => {
    console.error('❌ Error fixing availability:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })