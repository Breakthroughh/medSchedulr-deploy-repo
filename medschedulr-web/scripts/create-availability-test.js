const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('🔄 Creating availability records for oncall posts testing...')

  // Get all doctors
  const doctors = await prisma.doctor.findMany()
  if (doctors.length === 0) {
    console.log('❌ No doctors found. Please create doctors first.')
    return
  }

  // Get all active oncall posts
  const onCallPosts = await prisma.postConfig.findMany({
    where: { active: true }
  })
  
  console.log(`📋 Found ${doctors.length} doctors and ${onCallPosts.length} active posts:`)
  onCallPosts.forEach(p => console.log(`  - ${p.name} (${p.type})`))

  // Create a test roster period (shorter period to reduce data size)
  const startDate = new Date('2025-08-18')  
  const endDate = new Date('2025-08-31')

  const rosterPeriod = await prisma.rosterPeriod.upsert({
    where: { id: 'oncall-test-period' },
    update: {
      startDate,
      endDate,
      status: 'DRAFT'
    },
    create: {
      id: 'oncall-test-period',
      name: 'OnCall Posts Test Period',
      startDate,
      endDate,
      status: 'DRAFT'
    }
  })

  console.log(`✅ Test roster period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)

  // Create availability records
  const availabilityRecords = []
  const currentDate = new Date(startDate)
  
  while (currentDate <= endDate) {
    for (const doctor of doctors) {
      for (const post of onCallPosts) {
        // Make doctors available with high probability (80%)
        // Special case: Make sure at least one doctor is available for Standby Oncall on weekends
        let available = Math.random() > 0.2
        
        if (post.name === 'Standby Oncall' && (currentDate.getDay() === 0 || currentDate.getDay() === 6)) {
          // Ensure Standby Oncall is available for senior doctors on weekends
          available = doctor.category === 'SENIOR' || Math.random() > 0.1
        }

        availabilityRecords.push({
          doctorId: doctor.id,
          rosterPeriodId: rosterPeriod.id,
          postConfigId: post.id,
          date: new Date(currentDate),
          available: available,
          status: 'REQUESTED'
        })
      }
    }
    currentDate.setDate(currentDate.getDate() + 1)
  }

  // Delete existing availability for this period to avoid duplicates
  await prisma.availability.deleteMany({
    where: {
      rosterPeriodId: rosterPeriod.id
    }
  })

  // Create new availability records
  await prisma.availability.createMany({
    data: availabilityRecords,
    skipDuplicates: true
  })

  console.log(`✅ Created ${availabilityRecords.length} availability records`)
  
  // Show summary
  const availableCounts = await prisma.availability.groupBy({
    by: ['available'],
    where: {
      rosterPeriodId: rosterPeriod.id
    },
    _count: true
  })

  console.log('📊 Availability summary:')
  availableCounts.forEach(count => {
    console.log(`  ${count.available ? 'Available' : 'Not Available'}: ${count._count} records`)
  })

  // Show Standby Oncall weekend availability specifically
  const standbyPost = onCallPosts.find(p => p.name === 'Standby Oncall')
  if (standbyPost) {
    const standbyWeekendAvail = await prisma.availability.count({
      where: {
        rosterPeriodId: rosterPeriod.id,
        postConfigId: standbyPost.id,
        available: true,
        OR: [
          { date: { gte: new Date('2025-08-23'), lt: new Date('2025-08-25') } }, // Sat-Sun
          { date: { gte: new Date('2025-08-30'), lt: new Date('2025-09-01') } }, // Sat-Sun
          { date: { gte: new Date('2025-09-06'), lt: new Date('2025-09-08') } }, // Sat-Sun
          { date: { gte: new Date('2025-09-13'), lt: new Date('2025-09-15') } }  // Sat-Sun
        ]
      }
    })
    console.log(`🎯 Standby Oncall weekend availability: ${standbyWeekendAvail} records`)
  }

  console.log('🎉 Availability test data created successfully!')
  console.log(`📅 Test roster period ID: ${rosterPeriod.id}`)
}

main()
  .catch((e) => {
    console.error('❌ Error creating availability test:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })