import { prisma } from '@/lib/prisma'
import { subDays, subMonths, isWeekend, parseISO } from 'date-fns'

interface WorkloadSummary {
  doctorId: string
  weekdayOncalls: number
  weekendOncalls: number
  edShifts: number
  lastStandbyDate: Date | null
  daysSinceLastStandby: number
  standbyCount12Months: number
  standbyCount3Months: number
}

interface WorkloadCalculationOptions {
  referenceDate?: Date
  lookbackMonths?: number
  standbyLookbackMonths?: number
}

/**
 * Calculate cumulative workload for all doctors based on historical assignments
 */
export async function calculateCumulativeWorkload(options: WorkloadCalculationOptions = {}): Promise<WorkloadSummary[]> {
  const {
    referenceDate = new Date(),
    lookbackMonths = 3,
    standbyLookbackMonths = 12
  } = options

  const lookbackDate = subMonths(referenceDate, lookbackMonths)
  const standbyLookbackDate = subMonths(referenceDate, standbyLookbackMonths)

  console.log(`📊 Calculating workload from ${lookbackDate.toISOString().split('T')[0]} to ${referenceDate.toISOString().split('T')[0]}`)

  // Get all doctors
  const doctors = await prisma.doctors.findMany({
    where: { active: true },
    select: { id: true }
  })

  // Get all assignments within the lookback period
  const assignments = await prisma.schedule_assignments.findMany({
    where: {
      date: {
        gte: lookbackDate,
        lte: referenceDate
      }
    },
    include: {
      doctors: {
        select: { id: true }
      }
    },
    orderBy: { date: 'desc' }
  })

  console.log(`📈 Found ${assignments.length} assignments across ${doctors.length} doctors`)

  // Calculate workload for each doctor
  const workloadSummaries: WorkloadSummary[] = []

  for (const doctor of doctors) {
    const doctorAssignments = assignments.filter(a => a.doctorId === doctor.id)
    
    // Categorize assignments
    let weekdayOncalls = 0
    let weekendOncalls = 0
    let edShifts = 0
    let lastStandbyDate: Date | null = null
    let standbyCount12Months = 0
    let standbyCount3Months = 0

    const oncallPosts = ['Ward', 'ED', 'Standby']

    doctorAssignments.forEach(assignment => {
      const assignmentDate = new Date(assignment.date)
      const postName = assignment.postName
      
      // Skip clinic assignments
      if (postName.toLowerCase().includes('clinic')) return
      
      // Check if this is an oncall post
      const isOncall = oncallPosts.some(post => postName.includes(post))
      
      if (isOncall) {
        if (isWeekend(assignmentDate)) {
          weekendOncalls++
        } else {
          weekdayOncalls++
        }
      }
      
      // Count ED shifts specifically
      if (postName.toLowerCase().includes('ed')) {
        edShifts++
      }
      
      // Track Standby Oncall assignments
      if (postName.includes('Standby Oncall')) {
        if (!lastStandbyDate || assignmentDate > lastStandbyDate) {
          lastStandbyDate = assignmentDate
        }
        
        // Count standby assignments in different timeframes
        if (assignmentDate >= standbyLookbackDate) {
          standbyCount12Months++
        }
        
        if (assignmentDate >= lookbackDate) {
          standbyCount3Months++
        }
      }
    })

    // Calculate days since last standby
    const daysSinceLastStandby = lastStandbyDate 
      ? Math.floor((referenceDate.getTime() - lastStandbyDate.getTime()) / (1000 * 60 * 60 * 24))
      : 9999 // Very large number if never done standby

    workloadSummaries.push({
      doctorId: doctor.id,
      weekdayOncalls,
      weekendOncalls,
      edShifts,
      lastStandbyDate,
      daysSinceLastStandby,
      standbyCount12Months,
      standbyCount3Months
    })
  }

  console.log(`✅ Calculated workload for ${workloadSummaries.length} doctors`)
  
  // Log summary statistics
  const avgWeekdayOncalls = workloadSummaries.reduce((sum, w) => sum + w.weekdayOncalls, 0) / workloadSummaries.length
  const avgWeekendOncalls = workloadSummaries.reduce((sum, w) => sum + w.weekendOncalls, 0) / workloadSummaries.length
  const avgEdShifts = workloadSummaries.reduce((sum, w) => sum + w.edShifts, 0) / workloadSummaries.length
  const totalStandbyLast12Months = workloadSummaries.reduce((sum, w) => sum + w.standbyCount12Months, 0)

  console.log(`📈 Workload Summary (${lookbackMonths} months):`)
  console.log(`  - Avg weekday oncalls: ${avgWeekdayOncalls.toFixed(1)}`)
  console.log(`  - Avg weekend oncalls: ${avgWeekendOncalls.toFixed(1)}`)
  console.log(`  - Avg ED shifts: ${avgEdShifts.toFixed(1)}`)
  console.log(`  - Total Standby (12mo): ${totalStandbyLast12Months}`)

  return workloadSummaries
}

/**
 * Update doctor workload fields in database based on calculated workload
 */
export async function updateDoctorWorkloadFields(workloadSummaries: WorkloadSummary[]): Promise<void> {
  console.log(`💾 Updating workload fields for ${workloadSummaries.length} doctors`)

  const updatePromises = workloadSummaries.map(async (workload) => {
    await prisma.doctors.update({
      where: { id: workload.doctorId },
      data: {
        workloadWeekday: workload.weekdayOncalls,
        workloadWeekend: workload.weekendOncalls,
        workloadED: workload.edShifts,
        lastStandby: workload.lastStandbyDate
      }
    })
  })

  await Promise.all(updatePromises)
  console.log(`✅ Updated workload fields in database`)
}

/**
 * Get workload data formatted for Python API
 */
export async function getWorkloadForPythonAPI(workloadSummaries: WorkloadSummary[]) {
  return workloadSummaries.map(workload => ({
    doctor_id: workload.doctorId,
    weekday_oncalls_3m: workload.weekdayOncalls,
    weekend_oncalls_3m: workload.weekendOncalls,
    ed_shifts_3m: workload.edShifts,
    days_since_last_standby: workload.daysSinceLastStandby,
    standby_count_12m: workload.standbyCount12Months,
    standby_count_3m: workload.standbyCount3Months
  }))
}

/**
 * Refresh workload data for all doctors - call before schedule generation
 */
export async function refreshDoctorWorkloads(referenceDate?: Date): Promise<WorkloadSummary[]> {
  console.log('🔄 Refreshing doctor workload data...')
  
  const workloadSummaries = await calculateCumulativeWorkload({
    referenceDate,
    lookbackMonths: 3,
    standbyLookbackMonths: 12
  })
  
  await updateDoctorWorkloadFields(workloadSummaries)
  
  console.log('✅ Doctor workload refresh complete')
  return workloadSummaries
}

/**
 * Get doctors who are eligible for Standby Oncall (haven't done it in past year)
 */
export function getStandbyEligibleDoctors(workloadSummaries: WorkloadSummary[], doctorIds: string[]): string[] {
  const eligibleDoctors = workloadSummaries
    .filter(w => doctorIds.includes(w.doctorId) && w.standbyCount12Months === 0)
    .map(w => w.doctorId)
  
  console.log(`🎯 Standby eligible doctors: ${eligibleDoctors.length}/${doctorIds.length}`)
  
  return eligibleDoctors
}

/**
 * Get workload balance scores for fair distribution
 */
export function calculateWorkloadScores(workloadSummaries: WorkloadSummary[]): Record<string, number> {
  const scores: Record<string, number> = {}
  
  // Calculate total workload scores (lower = less worked, should get priority)
  workloadSummaries.forEach(workload => {
    const totalOncalls = workload.weekdayOncalls + workload.weekendOncalls
    const standbyPenalty = workload.standbyCount12Months * 100 // Heavy penalty for recent standby
    const recencyBonus = Math.min(workload.daysSinceLastStandby / 30, 50) // Bonus for not doing standby recently
    
    scores[workload.doctorId] = totalOncalls + standbyPenalty - recencyBonus
  })
  
  return scores
}

export type { WorkloadSummary, WorkloadCalculationOptions }