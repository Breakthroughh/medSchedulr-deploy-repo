const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 Debugging Standby Oncall issue...')

  // Check if Standby Oncall post exists
  const standbyPost = await prisma.post_configs.findFirst({
    where: { name: 'Standby Oncall' }
  })

  if (!standbyPost) {
    console.log('❌ Standby Oncall post not found!')
    return
  }

  console.log(`✅ Standby Oncall post found: ${standbyPost.name} (${standbyPost.type})`)

  // Get all roster periods
  const rosterPeriods = await prisma.rosterPeriod.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  })

  console.log(`📋 Found ${rosterPeriods.length} roster periods:`)
  rosterPeriods.forEach(p => console.log(`  - ${p.id}: ${p.name} (${p.startDate.toISOString().split('T')[0]} to ${p.endDate.toISOString().split('T')[0]})`))

  if (rosterPeriods.length === 0) {
    console.log('❌ No roster periods found')
    return
  }

  const latestPeriod = rosterPeriods[0]
  console.log(`\n🔍 Analyzing latest period: ${latestPeriod.name}`)

  // Check availability for Standby Oncall
  const standbyAvailability = await prisma.availability.findMany({
    where: {
      rosterPeriodId: latestPeriod.id,
      postConfigId: standbyPost.id
    },
    include: {
      doctor: true,
      post_configs: true
    },
    orderBy: [
      { date: 'asc' },
      { doctor: { displayName: 'asc' } }
    ]
  })

  console.log(`📋 Standby Oncall availability: ${standbyAvailability.length} records`)
  
  // Group by date
  const availabilityByDate = {}
  standbyAvailability.forEach(avail => {
    const dateStr = avail.date.toISOString().split('T')[0]
    if (!availabilityByDate[dateStr]) {
      availabilityByDate[dateStr] = { available: [], unavailable: [] }
    }
    if (avail.available) {
      availabilityByDate[dateStr].available.push(avail.doctor.displayName)
    } else {
      availabilityByDate[dateStr].unavailable.push(avail.doctor.displayName)
    }
  })

  console.log('\n📅 Standby Oncall availability by date:')
  Object.entries(availabilityByDate).forEach(([date, data]) => {
    const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6
    const weekendTag = isWeekend ? ' (WEEKEND)' : ''
    console.log(`  ${date}${weekendTag}:`)
    console.log(`    Available: ${data.available.length} doctors`)
    console.log(`    Unavailable: ${data.unavailable.length} doctors`)
    if (data.available.length > 0) {
      console.log(`    Available doctors: ${data.available.join(', ')}`)
    }
  })

  // Check schedule assignments
  const standbyAssignments = await prisma.schedule_assignments.findMany({
    where: {
      rosterPeriodId: latestPeriod.id,
      postName: 'Standby Oncall'
    },
    include: {
      doctors: true
    },
    orderBy: { date: 'asc' }
  })

  console.log(`\n📋 Standby Oncall assignments: ${standbyAssignments.length} records`)
  
  if (standbyAssignments.length > 0) {
    console.log('📅 Standby Oncall assignments by date:')
    standbyAssignments.forEach(assignment => {
      const dateStr = assignment.date.toISOString().split('T')[0]
      const isWeekend = assignment.date.getDay() === 0 || assignment.date.getDay() === 6
      const weekendTag = isWeekend ? ' (WEEKEND)' : ''
      console.log(`  ${dateStr}${weekendTag}: ${assignment.doctors.displayName}`)
    })
  } else {
    console.log('❌ No Standby Oncall assignments found!')
  }

  // Check if there are any schedule generations
  const scheduleGenerations = await prisma.schedule_generations.findMany({
    where: { rosterPeriodId: latestPeriod.id },
    orderBy: { createdAt: 'desc' }
  })

  console.log(`\n📋 Schedule generations: ${scheduleGenerations.length} records`)
  scheduleGenerations.forEach(gen => {
    console.log(`  - ${gen.id}: ${gen.status} (${gen.createdAt.toISOString()})`)
    if (gen.error) {
      console.log(`    Error: ${gen.error}`)
    }
  })

  // Check all posts
  const allPosts = await prisma.post_configs.findMany({
    where: { active: true }
  })

  console.log('\n📋 All active posts:')
  allPosts.forEach(post => {
    console.log(`  - ${post.name} (${post.type})`)
  })
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 