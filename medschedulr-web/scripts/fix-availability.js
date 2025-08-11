const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Fixing availability records for on-call posts...')

  // Get all roster periods
  const rosterPeriods = await prisma.rosterPeriod.findMany()

  if (rosterPeriods.length === 0) {
    console.log('ℹ️ No active roster periods found')
    return
  }

  // Get all doctors
  const doctors = await prisma.doctors.findMany({
    where: { active: true }
  })

  // Get all active posts, especially on-call posts
  const posts = await prisma.post_configs.findMany({ 
    where: { active: true }
  })

  console.log(`📊 Found: ${doctors.length} doctors, ${posts.length} posts, ${rosterPeriods.length} roster periods`)

  // For each roster period
  for (const rosterPeriod of rosterPeriods) {
    console.log(`\n🏥 Processing roster period: ${rosterPeriod.name}`)
    
    // Generate date range for this period
    const dates = []
    let currentDate = new Date(rosterPeriod.startDate)
    const endDate = new Date(rosterPeriod.endDate)
    
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }

    console.log(`📅 Date range: ${dates.length} days`)

    // Check and create missing availability records
    let createdCount = 0
    
    for (const doctor of doctors) {
      for (const post of posts) {
        for (const date of dates) {
          // Check if availability record exists
          const existing = await prisma.availability.findUnique({
            where: {
              doctorId_rosterPeriodId_postConfigId_date: {
                doctorId: doctor.id,
                rosterPeriodId: rosterPeriod.id,
                postConfigId: post.id,
                date: date
              }
            }
          })

          if (!existing) {
            // Create availability record - default to 70% available for on-call posts
            const isOnCallPost = post.name.toLowerCase().includes('call') || 
                               post.name.toLowerCase().includes('standby')
            
            await prisma.availability.create({
              data: {
                id: `avail_fix_${doctor.id}_${post.id}_${date.getTime()}`,
                doctorId: doctor.id,
                rosterPeriodId: rosterPeriod.id,
                postConfigId: post.id,
                date: date,
                available: isOnCallPost ? (Math.random() > 0.3) : (Math.random() > 0.2), // 70% for oncall, 80% for regular
                status: 'REQUESTED'
              }
            })
            createdCount++
          }
        }
      }
    }

    console.log(`✅ Created ${createdCount} new availability records for ${rosterPeriod.name}`)
  }

  // Show summary
  const totalAvailability = await prisma.availability.count()
  const onCallPosts = posts.filter(p => 
    p.name.toLowerCase().includes('call') || 
    p.name.toLowerCase().includes('standby')
  )
  
  console.log(`\n📈 Summary:`)
  console.log(`- Total availability records: ${totalAvailability}`)
  console.log(`- On-call posts found: ${onCallPosts.map(p => p.name).join(', ')}`)
  
  for (const post of onCallPosts) {
    const count = await prisma.availability.count({
      where: { postConfigId: post.id }
    })
    console.log(`- ${post.name} (${post.type}): ${count} availability records`)
  }

  console.log('\n🎉 Availability repair completed!')
}

main()
  .catch((e) => {
    console.error('❌ Error fixing availability:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })