const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('🏗️ Creating missing post configurations...')

  const postsToCreate = [
    {
      id: 'post_weekday_shift',
      name: 'Weekday Shift',
      type: 'WEEKDAY',
      active: true
    },
    {
      id: 'post_weekend_shift',
      name: 'Weekend Shift',
      type: 'WEEKEND',
      active: true
    },
    {
      id: 'post_on_call',
      name: 'On-Call',
      type: 'BOTH',
      active: true
    },
    {
      id: 'post_standby_oncall',
      name: 'Standby Oncall',
      type: 'WEEKEND',
      active: true
    },
    {
      id: 'post_ed1',
      name: 'ED1',
      type: 'BOTH',
      active: true
    },
    {
      id: 'post_ed2',
      name: 'ED2',
      type: 'BOTH',
      active: true
    },
    {
      id: 'post_ward1',
      name: 'Ward1',
      type: 'WEEKDAY',
      active: true
    },
    {
      id: 'post_ward2',
      name: 'Ward2',
      type: 'WEEKDAY',
      active: true
    }
  ]

  let createdCount = 0

  for (const post of postsToCreate) {
    try {
      // Check if post already exists
      const existing = await prisma.post_configs.findUnique({
        where: { name: post.name }
      })

      if (!existing) {
        await prisma.post_configs.create({
          data: {
            ...post,
            updatedAt: new Date()
          }
        })
        console.log(`✅ Created post: ${post.name} (${post.type})`)
        createdCount++
      } else {
        console.log(`ℹ️ Post already exists: ${post.name}`)
      }
    } catch (error) {
      console.error(`❌ Error creating post ${post.name}:`, error.message)
    }
  }

  console.log(`\n🎉 Created ${createdCount} new posts`)

  // Show all posts
  const allPosts = await prisma.post_configs.findMany({
    where: { active: true },
    orderBy: { name: 'asc' }
  })

  console.log('\n📋 All active posts:')
  allPosts.forEach(post => {
    console.log(`- ${post.name} (${post.type})`)
  })
}

main()
  .catch((e) => {
    console.error('❌ Error creating posts:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })