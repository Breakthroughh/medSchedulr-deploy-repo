const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log('🔄 Updating post configurations...')

  // Create additional post configurations including Standby Oncall
  const postConfigs = await Promise.all([
    prisma.postConfig.upsert({
      where: { name: 'Standby Oncall' },
      update: { active: true },
      create: {
        name: 'Standby Oncall',
        type: 'WEEKEND',
        active: true
      }
    }),
    prisma.postConfig.upsert({
      where: { name: 'ED1' },
      update: { active: true },
      create: {
        name: 'ED1',
        type: 'BOTH',
        active: true
      }
    }),
    prisma.postConfig.upsert({
      where: { name: 'ED2' },
      update: { active: true },
      create: {
        name: 'ED2',
        type: 'BOTH',
        active: true
      }
    }),
    prisma.postConfig.upsert({
      where: { name: 'Ward1' },
      update: { active: true },
      create: {
        name: 'Ward1',
        type: 'WEEKDAY',
        active: true
      }
    }),
    prisma.postConfig.upsert({
      where: { name: 'Ward2' },
      update: { active: true },
      create: {
        name: 'Ward2',
        type: 'WEEKDAY',
        active: true
      }
    })
  ])
  
  console.log('✅ Post configs updated:', postConfigs.map(p => p.name))
  console.log('🎉 Post configurations updated successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Error updating posts:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })