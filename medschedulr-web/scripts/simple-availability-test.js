const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('🔄 Creating simple availability test for oncall posts...')

  // Get a few doctors
  const doctors = await prisma.doctor.findMany({
    take: 3
  })
  if (doctors.length === 0) {
    console.log('❌ No doctors found. Please create doctors first.')
    return
  }

  // Get Standby Oncall post specifically
  const standbyPost = await prisma.postConfig.findFirst({
    where: { name: 'Standby Oncall', active: true }
  })

  // Get a few other posts
  const otherPosts = await prisma.postConfig.findMany({
    where: { 
      active: true,
      NOT: { name: 'Standby Oncall' }
    },
    take: 3
  })
  
  if (!standbyPost) {
    console.log('❌ Standby Oncall post not found. Please run update-posts.js first.')
    return
  }

  console.log(`📋 Found ${doctors.length} doctors and ${otherPosts.length + 1} posts`)

  // Create a test roster period
  const startDate = new Date('2025-08-23')  // Start on a Saturday
  const endDate = new Date('2025-08-31')

  const rosterPeriod = await prisma.rosterPeriod.upsert({
    where: { id: 'simple-oncall-test' },
    update: {
      startDate,
      endDate,
      status: 'DRAFT'
    },
    create: {
      id: 'simple-oncall-test',
      name: 'Simple OnCall Test',
      startDate,
      endDate,
      status: 'DRAFT'
    }
  })

  console.log(`✅ Test roster period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)

  // Delete existing availability for this period
  await prisma.availability.deleteMany({
    where: {
      rosterPeriodId: rosterPeriod.id
    }
  })

  // Create availability records one by one for control
  const dates = []
  const currentDate = new Date(startDate)
  while (currentDate <= endDate) {
    dates.push(new Date(currentDate))
    currentDate.setDate(currentDate.getDate() + 1)
  }

  let recordCount = 0
  const allPosts = [standbyPost, ...otherPosts]

  for (const date of dates) {
    for (const doctor of doctors) {
      for (const post of allPosts) {
        // Make senior doctors more likely available for Standby Oncall on weekends
        let available = Math.random() > 0.3
        
        if (post.name === 'Standby Oncall' && (date.getDay() === 0 || date.getDay() === 6)) {
          available = doctor.category === 'SENIOR' || Math.random() > 0.2
        }

        await prisma.availability.create({
          data: {
            doctorId: doctor.id,
            rosterPeriodId: rosterPeriod.id,
            postConfigId: post.id,
            date: date,
            available: available,
            status: 'REQUESTED'
          }
        })
        recordCount++
      }
    }
  }

  console.log(`✅ Created ${recordCount} availability records`)
  
  // Show summary for Standby Oncall on weekends
  const standbyWeekendAvail = await prisma.availability.count({
    where: {
      rosterPeriodId: rosterPeriod.id,
      postConfigId: standbyPost.id,
      available: true,
      date: {
        gte: startDate,
        lte: endDate
      },
      // Saturday or Sunday
      OR: [
        { date: { gte: new Date('2025-08-23'), lt: new Date('2025-08-24') } }, // Saturday
        { date: { gte: new Date('2025-08-24'), lt: new Date('2025-08-25') } }, // Sunday
        { date: { gte: new Date('2025-08-30'), lt: new Date('2025-08-31') } }, // Saturday
        { date: { gte: new Date('2025-08-31'), lt: new Date('2025-09-01') } }  // Sunday
      ]
    }
  })
  
  console.log(`🎯 Standby Oncall weekend availability: ${standbyWeekendAvail} records`)
  console.log('🎉 Simple availability test data created successfully!')
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