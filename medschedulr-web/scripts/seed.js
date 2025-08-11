const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12)
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@hospital.com' },
    update: {},
    create: {
      email: 'admin@hospital.com',
      password: adminPassword,
      role: 'ADMIN',
      active: true
    }
  })
  
  console.log('✅ Admin user created:', admin.email)

  // Create some sample units
  const units = await Promise.all([
    prisma.unit.upsert({
      where: { name: 'Emergency Department' },
      update: {},
      create: {
        name: 'Emergency Department',
        active: true,
        clinic_days: {
          create: [
            { id: `clinic_ed_1`, weekday: 0 }, // Monday
            { id: `clinic_ed_2`, weekday: 1 }, // Tuesday
            { id: `clinic_ed_3`, weekday: 2 }, // Wednesday
            { id: `clinic_ed_4`, weekday: 3 }, // Thursday
            { id: `clinic_ed_5`, weekday: 4 }, // Friday
            { id: `clinic_ed_6`, weekday: 5 }, // Saturday
            { id: `clinic_ed_7`, weekday: 6 }, // Sunday
          ]
        }
      }
    }),
    prisma.unit.upsert({
      where: { name: 'Internal Medicine' },
      update: {},
      create: {
        name: 'Internal Medicine',
        active: true,
        clinic_days: {
          create: [
            { id: `clinic_im_1`, weekday: 0 }, // Monday
            { id: `clinic_im_2`, weekday: 1 }, // Tuesday
            { id: `clinic_im_3`, weekday: 2 }, // Wednesday
            { id: `clinic_im_4`, weekday: 3 }, // Thursday
            { id: `clinic_im_5`, weekday: 4 }, // Friday
          ]
        }
      }
    })
  ])
  
  console.log('✅ Units created:', units.map(u => u.name))

  // Create some sample doctors with user accounts
  const doctorPassword = await bcrypt.hash('doctor123', 12)
  
  const doctors = await Promise.all([
    prisma.doctors.create({
      data: {
        id: `doctor_sarah_${Date.now()}`,
        displayName: 'Dr. Sarah Johnson',
        unitId: units[0].id,
        category: 'SENIOR',
        active: true,
        workloadWeekday: 0,
        workloadWeekend: 0,
        workloadED: 0,
        updatedAt: new Date(),
        users: {
          create: {
            email: 'sarah.johnson@hospital.com',
            password: doctorPassword,
            role: 'DOCTOR',
            active: true
          }
        }
      }
    }),
    prisma.doctors.create({
      data: {
        id: `doctor_michael_${Date.now()}`,
        displayName: 'Dr. Michael Chen',
        unitId: units[1].id,
        category: 'JUNIOR',
        active: true,
        workloadWeekday: 0,
        workloadWeekend: 0,
        workloadED: 0,
        updatedAt: new Date(),
        users: {
          create: {
            email: 'michael.chen@hospital.com',
            password: doctorPassword,
            role: 'DOCTOR',
            active: true
          }
        }
      }
    }),
    prisma.doctors.create({
      data: {
        id: `doctor_emily_${Date.now()}`,
        displayName: 'Dr. Emily Rodriguez',
        unitId: units[0].id,
        category: 'REGISTRAR',
        active: true,
        workloadWeekday: 0,
        workloadWeekend: 0,
        workloadED: 0,
        updatedAt: new Date(),
        users: {
          create: {
            email: 'emily.rodriguez@hospital.com',
            password: doctorPassword,
            role: 'DOCTOR',
            active: true
          }
        }
      }
    })
  ])
  
  console.log('✅ Doctors created:', doctors.map(d => d.displayName))

  // Create some post configurations
  const postConfigs = await Promise.all([
    prisma.post_configs.upsert({
      where: { name: 'Weekday Shift' },
      update: {},
      create: {
        id: 'post_weekday_shift',
        name: 'Weekday Shift',
        type: 'WEEKDAY',
        active: true
      }
    }),
    prisma.post_configs.upsert({
      where: { name: 'Weekend Shift' },
      update: {},
      create: {
        id: 'post_weekend_shift',
        name: 'Weekend Shift',
        type: 'WEEKEND', 
        active: true
      }
    }),
    prisma.post_configs.upsert({
      where: { name: 'On-Call' },
      update: {},
      create: {
        id: 'post_on_call',
        name: 'On-Call',
        type: 'BOTH',
        active: true
      }
    }),
    prisma.post_configs.upsert({
      where: { name: 'Standby Oncall' },
      update: {},
      create: {
        id: 'post_standby_oncall',
        name: 'Standby Oncall',
        type: 'WEEKEND',
        active: true
      }
    }),
    prisma.post_configs.upsert({
      where: { name: 'ED1' },
      update: {},
      create: {
        id: 'post_ed1',
        name: 'ED1',
        type: 'BOTH',
        active: true
      }
    }),
    prisma.post_configs.upsert({
      where: { name: 'ED2' },
      update: {},
      create: {
        id: 'post_ed2',
        name: 'ED2',
        type: 'BOTH',
        active: true
      }
    }),
    prisma.post_configs.upsert({
      where: { name: 'Ward1' },
      update: {},
      create: {
        id: 'post_ward1',
        name: 'Ward1',
        type: 'WEEKDAY',
        active: true
      }
    }),
    prisma.post_configs.upsert({
      where: { name: 'Ward2' },
      update: {},
      create: {
        id: 'post_ward2',
        name: 'Ward2',
        type: 'WEEKDAY',
        active: true
      }
    })
  ])
  
  console.log('✅ Post configs created:', postConfigs.map(p => p.name))

  // Create solver config
  const solverConfig = await prisma.solver_configs.upsert({
    where: { name: 'default' },
    update: {},
    create: {
      id: 'solver_config_default',
      name: 'default',
      lambdaRest: 3,
      lambdaGap: 1,
      lambdaED: 6,
      lambdaStandby: 5,
      lambdaMinOne: 10,
      lambdaRegWeekend: 2,
      lambdaUnitOver: 25,
      lambdaJuniorWard: 6,
      clinicPenaltyBefore: 10,
      clinicPenaltySame: 50,
      clinicPenaltyAfter: 5,
      bigM: 10000,
      solverTimeoutSeconds: 600,
      active: true,
      updatedAt: new Date()
    }
  })
  
  console.log('✅ Solver config created')

  // Create some sample availability for testing
  const today = new Date()
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const endDate = new Date(nextWeek.getTime() + 28 * 24 * 60 * 60 * 1000) // 4 weeks

  // Create a sample roster period for testing
  const testPeriod = await prisma.rosterPeriod.upsert({
    where: { id: 'test-period-123' },
    update: {},
    create: {
      id: 'test-period-123',
      name: 'Test Roster Period',
      startDate: nextWeek,
      endDate: endDate,
      status: 'DRAFT'
    }
  })
  
  console.log('✅ Test roster period created')

  // Create availability records for testing
  const availabilityRecords = []
  for (let i = 0; i < 14; i++) { // 2 weeks of availability
    const date = new Date(nextWeek.getTime() + i * 24 * 60 * 60 * 1000)
    
    // Each doctor available for each post type
    for (const doctor of doctors) {
      for (const postConfig of postConfigs) {
        availabilityRecords.push({
          id: `avail_${doctor.id}_${postConfig.id}_${i}`,
          doctorId: doctor.id,
          rosterPeriodId: testPeriod.id,
          postConfigId: postConfig.id,
          date: date,
          available: Math.random() > 0.3, // 70% available
          status: 'REQUESTED'
        })
      }
    }
  }

  try {
    await prisma.availability.createMany({
      data: availabilityRecords
    })
  } catch (error) {
    if (error.code !== 'P2002') {
      throw error
    }
    console.log('ℹ️ Some availability records already exist, skipping duplicates')
  }
  
  console.log(`✅ Created ${availabilityRecords.length} availability records`)
  
  console.log('🎉 Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })