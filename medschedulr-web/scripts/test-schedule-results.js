const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('🔍 Analyzing schedule results...')

  // Look for any recent roster period with assignments
  const recentPeriods = await prisma.rosterPeriod.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  })
  
  console.log('📋 Available roster periods:')
  recentPeriods.forEach(p => console.log(`  - ${p.id}: ${p.name}`))

  // Use oncall-test-period (the one from logs with 23 assignments)
  let rosterPeriod = await prisma.rosterPeriod.findUnique({
    where: { id: 'oncall-test-period' }
  })
  
  if (!rosterPeriod) {
    // Look for any recent roster period with assignments
    const recentPeriods = await prisma.rosterPeriod.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    })
    
    console.log('📋 Available roster periods:')
    recentPeriods.forEach(p => console.log(`  - ${p.id}: ${p.name}`))
    
    rosterPeriod = recentPeriods.find(p => p.id === 'oncall-test-period') || recentPeriods[0]
  }

  if (!rosterPeriod) {
    console.log('❌ Test roster period not found')
    return
  }

  // Get all schedule assignments for this period
  const assignments = await prisma.schedule_assignments.findMany({
    where: {
      rosterPeriodId: rosterPeriod.id
    },
    include: {
      doctors: true
    },
    orderBy: [
      { date: 'asc' },
      { postName: 'asc' }
    ]
  })

  console.log(`📋 Found ${assignments.length} assignments for period ${rosterPeriod.name}`)
  console.log(`📅 Period: ${rosterPeriod.startDate.toISOString().split('T')[0]} to ${rosterPeriod.endDate.toISOString().split('T')[0]}`)

  // Group by post type
  const postCounts = {}
  const standbyWeekendPairs = []
  
  assignments.forEach(assignment => {
    const post = assignment.postName
    const date = assignment.date.toISOString().split('T')[0]
    const weekday = assignment.date.getDay()
    
    if (!postCounts[post]) {
      postCounts[post] = 0
    }
    postCounts[post]++

    // Track Standby Oncall weekend patterns
    if (post === 'Standby Oncall' && (weekday === 6 || weekday === 0)) { // Sat or Sun
      standbyWeekendPairs.push({
        doctor: assignment.doctors.displayName,
        date: date,
        weekday: weekday === 6 ? 'Saturday' : 'Sunday'
      })
    }
  })

  console.log('\n📊 Assignment counts by post:')
  Object.entries(postCounts).forEach(([post, count]) => {
    console.log(`  ${post}: ${count} assignments`)
  })

  // Check for weekend posts that should be allocated
  console.log('\n🔍 Weekend post allocation analysis:')
  const weekendDates = []
  const currentDate = new Date(rosterPeriod.startDate)
  while (currentDate <= rosterPeriod.endDate) {
    if (currentDate.getDay() === 0 || currentDate.getDay() === 6) { // Sunday or Saturday
      weekendDates.push(new Date(currentDate))
    }
    currentDate.setDate(currentDate.getDate() + 1)
  }
  
  console.log(`  Total weekend days in period: ${weekendDates.length}`)
  
  const weekendPosts = ['Ward 6', 'ED1', 'ED2', 'Standby Oncall']
  weekendPosts.forEach(post => {
    const weekendAssignments = assignments.filter(a => {
      const weekday = a.date.getDay()
      return a.postName === post && (weekday === 0 || weekday === 6)
    })
    console.log(`  ${post} weekend assignments: ${weekendAssignments.length} (expected: ${post === 'Standby Oncall' ? Math.floor(weekendDates.length / 2) : weekendDates.length})`)
  })

  // Analyze Standby Oncall 2-day pattern
  if (standbyWeekendPairs.length > 0) {
    console.log('\n🎯 Standby Oncall weekend pattern analysis:')
    
    const weekendGroups = {}
    standbyWeekendPairs.forEach(pair => {
      const date = new Date(pair.date)
      // Group by week (get the Saturday date of each week)
      const saturday = new Date(date)
      if (date.getDay() === 0) { // If Sunday, get previous Saturday
        saturday.setDate(saturday.getDate() - 1)
      }
      const weekKey = saturday.toISOString().split('T')[0]
      
      if (!weekendGroups[weekKey]) {
        weekendGroups[weekKey] = []
      }
      weekendGroups[weekKey].push(pair)
    })

    Object.entries(weekendGroups).forEach(([weekStart, pairs]) => {
      console.log(`  Week starting ${weekStart}:`)
      const saturdayPair = pairs.find(p => p.weekday === 'Saturday')
      const sundayPair = pairs.find(p => p.weekday === 'Sunday')
      
      if (saturdayPair && sundayPair) {
        if (saturdayPair.doctor === sundayPair.doctor) {
          console.log(`    ✅ Same doctor (${saturdayPair.doctor}) for both days`)
        } else {
          console.log(`    ❌ Different doctors: ${saturdayPair.doctor} (Sat) vs ${sundayPair.doctor} (Sun)`)
        }
      } else {
        console.log(`    ⚠️  Incomplete weekend: Sat=${saturdayPair?.doctor || 'none'}, Sun=${sundayPair?.doctor || 'none'}`)
      }
    })
  }

  console.log('\n✅ Schedule analysis complete')
}

main()
  .catch((e) => {
    console.error('❌ Error analyzing schedule:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })