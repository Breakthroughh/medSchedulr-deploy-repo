interface Doctor {
  id: string
  name: string
  unit: string
  unitId: string
  category: string
  clinicDays: number[]
}

interface Assignment {
  id: string
  date: string
  postName: string
  doctor: Doctor
}

interface Unit {
  id: string
  name: string
}

interface Violation {
  type: 'rest' | 'clinic_conflict' | 'registrar_weekend' | 'junior_ward' | 'ed_assignment' | 'unit_over_coverage' | 'standby_pairing'
  severity: 'high' | 'medium' | 'low'
  message: string
  doctorId: string
  date: string
  assignmentId?: string
  relatedAssignmentIds?: string[]
}

interface ViolationCheckParams {
  assignments: Assignment[]
  doctors: Doctor[]
  units: Unit[]
  rosterPeriod: {
    startDate: string
    endDate: string
  }
}

export function checkViolations({ assignments, doctors, units, rosterPeriod }: ViolationCheckParams): Violation[] {
  const violations: Violation[] = []
  
  // Create doctor lookup
  const doctorMap = new Map(doctors.map(d => [d.id, d]))
  
  // Group assignments by doctor and sort by date
  const assignmentsByDoctor = new Map<string, Assignment[]>()
  assignments.forEach(assignment => {
    const doctorId = assignment.doctor.id
    if (!assignmentsByDoctor.has(doctorId)) {
      assignmentsByDoctor.set(doctorId, [])
    }
    assignmentsByDoctor.get(doctorId)!.push(assignment)
  })
  
  // Sort assignments by date for each doctor
  assignmentsByDoctor.forEach(doctorAssignments => {
    doctorAssignments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  })

  // Check violations for each doctor
  assignmentsByDoctor.forEach((doctorAssignments, doctorId) => {
    const doctor = doctorMap.get(doctorId)!
    
    violations.push(...checkRestViolations(doctorAssignments, doctor))
    violations.push(...checkClinicConflicts(doctorAssignments, doctor))
    violations.push(...checkRegistrarWeekendViolations(doctorAssignments, doctor))
    violations.push(...checkJuniorWardViolations(doctorAssignments, doctor))
    violations.push(...checkEDAssignmentViolations(doctorAssignments, doctor))
  })
  
  // Check unit over-coverage violations (cross-doctor)
  violations.push(...checkUnitOverCoverage(assignments, doctors, units))
  
  // Check Standby Oncall pairing violations
  violations.push(...checkStandbyPairingViolations(assignments))
  
  return violations
}

function checkRestViolations(assignments: Assignment[], doctor: Doctor): Violation[] {
  const violations: Violation[] = []
  const oncallPosts = ['Ward', 'ED', 'Standby']
  
  for (let i = 0; i < assignments.length - 1; i++) {
    const current = assignments[i]
    const next = assignments[i + 1]
    
    const currentDate = new Date(current.date)
    const nextDate = new Date(next.date)
    
    // Check if they're consecutive days
    const timeDiff = nextDate.getTime() - currentDate.getTime()
    const daysDiff = timeDiff / (1000 * 3600 * 24)
    
    if (daysDiff === 1) {
      const currentIsOncall = oncallPosts.some(post => current.postName.includes(post))
      const nextIsOncall = oncallPosts.some(post => next.postName.includes(post))
      
      if (currentIsOncall && nextIsOncall) {
        // Exception for Standby Oncall weekend pairs (Saturday-Sunday)
        const currentIsWeekend = currentDate.getDay() === 6 // Saturday
        const nextIsWeekend = nextDate.getDay() === 0 // Sunday
        const bothStandby = current.postName.includes('Standby') && next.postName.includes('Standby')
        
        if (!(currentIsWeekend && nextIsWeekend && bothStandby)) {
          violations.push({
            type: 'rest',
            severity: 'high',
            message: `Rest violation: ${doctor.name} has consecutive oncall shifts (${current.postName} → ${next.postName})`,
            doctorId: doctor.id,
            date: current.date,
            assignmentId: current.id,
            relatedAssignmentIds: [next.id]
          })
        }
      }
    }
  }
  
  return violations
}

function checkClinicConflicts(assignments: Assignment[], doctor: Doctor): Violation[] {
  const violations: Violation[] = []
  const oncallPosts = ['Ward', 'ED', 'Standby']
  
  assignments.forEach(assignment => {
    const assignmentDate = new Date(assignment.date)
    const dayOfWeek = assignmentDate.getDay()
    
    // Check if doctor has clinic on this day
    if (doctor.clinicDays.includes(dayOfWeek)) {
      const isOncall = oncallPosts.some(post => assignment.postName.includes(post))
      
      if (isOncall) {
        violations.push({
          type: 'clinic_conflict',
          severity: 'high',
          message: `Clinic conflict: ${doctor.name} has ${assignment.postName} on clinic day`,
          doctorId: doctor.id,
          date: assignment.date,
          assignmentId: assignment.id
        })
      }
    }
    
    // Check day before/after clinic days for oncall assignments
    const dayBefore = (dayOfWeek + 6) % 7 // Previous day
    const dayAfter = (dayOfWeek + 1) % 7 // Next day
    
    const isOncall = oncallPosts.some(post => assignment.postName.includes(post))
    
    if (isOncall && doctor.clinicDays.includes(dayBefore)) {
      violations.push({
        type: 'clinic_conflict',
        severity: 'medium',
        message: `Clinic proximity: ${doctor.name} has ${assignment.postName} day before clinic`,
        doctorId: doctor.id,
        date: assignment.date,
        assignmentId: assignment.id
      })
    }
    
    if (isOncall && doctor.clinicDays.includes(dayAfter)) {
      violations.push({
        type: 'clinic_conflict',
        severity: 'low',
        message: `Clinic proximity: ${doctor.name} has ${assignment.postName} day after clinic`,
        doctorId: doctor.id,
        date: assignment.date,
        assignmentId: assignment.id
      })
    }
  })
  
  return violations
}

function checkRegistrarWeekendViolations(assignments: Assignment[], doctor: Doctor): Violation[] {
  const violations: Violation[] = []
  
  if (doctor.category === 'registrar') {
    assignments.forEach(assignment => {
      const assignmentDate = new Date(assignment.date)
      const isWeekend = assignmentDate.getDay() === 0 || assignmentDate.getDay() === 6
      const oncallPosts = ['Ward', 'ED', 'Standby']
      const isOncall = oncallPosts.some(post => assignment.postName.includes(post))
      
      if (isWeekend && isOncall) {
        violations.push({
          type: 'registrar_weekend',
          severity: 'medium',
          message: `Registrar weekend: ${doctor.name} has ${assignment.postName} on weekend`,
          doctorId: doctor.id,
          date: assignment.date,
          assignmentId: assignment.id
        })
      }
    })
  }
  
  return violations
}

function checkJuniorWardViolations(assignments: Assignment[], doctor: Doctor): Violation[] {
  const violations: Violation[] = []
  
  if (doctor.category === 'junior') {
    assignments.forEach(assignment => {
      if (assignment.postName.startsWith('Ward')) {
        violations.push({
          type: 'junior_ward',
          severity: 'medium',
          message: `Junior ward assignment: ${doctor.name} assigned to ${assignment.postName}`,
          doctorId: doctor.id,
          date: assignment.date,
          assignmentId: assignment.id
        })
      }
    })
  }
  
  return violations
}

function checkEDAssignmentViolations(assignments: Assignment[], doctor: Doctor): Violation[] {
  const violations: Violation[] = []
  
  if (doctor.category === 'senior' || doctor.category === 'registrar') {
    assignments.forEach(assignment => {
      if (assignment.postName.startsWith('ED')) {
        violations.push({
          type: 'ed_assignment',
          severity: 'low',
          message: `ED assignment: ${doctor.name} (${doctor.category}) assigned to ${assignment.postName}`,
          doctorId: doctor.id,
          date: assignment.date,
          assignmentId: assignment.id
        })
      }
    })
  }
  
  return violations
}

function checkUnitOverCoverage(assignments: Assignment[], doctors: Doctor[], units: Unit[]): Violation[] {
  const violations: Violation[] = []
  
  // Group assignments by date
  const assignmentsByDate = new Map<string, Assignment[]>()
  assignments.forEach(assignment => {
    const dateStr = assignment.date
    if (!assignmentsByDate.has(dateStr)) {
      assignmentsByDate.set(dateStr, [])
    }
    assignmentsByDate.get(dateStr)!.push(assignment)
  })
  
  // Check each date for unit over-coverage
  assignmentsByDate.forEach((dayAssignments, dateStr) => {
    const date = new Date(dateStr)
    const dayOfWeek = date.getDay()
    
    // Group by unit
    const assignmentsByUnit = new Map<string, Assignment[]>()
    dayAssignments.forEach(assignment => {
      const unit = assignment.doctor.unit
      if (!assignmentsByUnit.has(unit)) {
        assignmentsByUnit.set(unit, [])
      }
      assignmentsByUnit.get(unit)!.push(assignment)
    })
    
    // Check coverage for each unit
    assignmentsByUnit.forEach((unitAssignments, unitName) => {
      const unit = units.find(u => u.name === unitName)
      const unitDoctors = doctors.filter(d => d.unit === unitName)
      const cap = Math.max(1, Math.ceil(0.25 * unitDoctors.length))
      
      // Check if this is a clinic day for this unit
      const isClinicDay = unitDoctors.some(d => d.clinicDays.includes(dayOfWeek))
      
      if (!isClinicDay && unitAssignments.length > cap) {
        violations.push({
          type: 'unit_over_coverage',
          severity: 'low',
          message: `Unit over-coverage: ${unitName} has ${unitAssignments.length} assignments (limit: ${cap}) on non-clinic day`,
          doctorId: unitAssignments[0].doctor.id,
          date: dateStr,
          relatedAssignmentIds: unitAssignments.map(a => a.id)
        })
      }
    })
  })
  
  return violations
}

function checkStandbyPairingViolations(assignments: Assignment[]): Violation[] {
  const violations: Violation[] = []
  
  const standbyAssignments = assignments.filter(a => a.postName.includes('Standby Oncall'))
  
  // Group by weekend pairs
  const weekendGroups = new Map<string, Assignment[]>()
  
  standbyAssignments.forEach(assignment => {
    const date = new Date(assignment.date)
    const dayOfWeek = date.getDay()
    
    if (dayOfWeek === 6 || dayOfWeek === 0) { // Saturday or Sunday
      // Get the Saturday date for this weekend
      const saturday = new Date(date)
      if (dayOfWeek === 0) { // If Sunday, get previous Saturday
        saturday.setDate(saturday.getDate() - 1)
      }
      const weekendKey = saturday.toISOString().split('T')[0]
      
      if (!weekendGroups.has(weekendKey)) {
        weekendGroups.set(weekendKey, [])
      }
      weekendGroups.get(weekendKey)!.push(assignment)
    }
  })
  
  // Check each weekend for pairing violations
  weekendGroups.forEach((weekendAssignments, weekendKey) => {
    const saturdayAssignment = weekendAssignments.find(a => new Date(a.date).getDay() === 6)
    const sundayAssignment = weekendAssignments.find(a => new Date(a.date).getDay() === 0)
    
    if (saturdayAssignment && sundayAssignment && 
        saturdayAssignment.doctor.id !== sundayAssignment.doctor.id) {
      violations.push({
        type: 'standby_pairing',
        severity: 'medium',
        message: `Standby pairing violation: Different doctors for weekend (${saturdayAssignment.doctor.name} Sat, ${sundayAssignment.doctor.name} Sun)`,
        doctorId: saturdayAssignment.doctor.id,
        date: saturdayAssignment.date,
        assignmentId: saturdayAssignment.id,
        relatedAssignmentIds: [sundayAssignment.id]
      })
    }
  })
  
  return violations
}

export type { Violation, ViolationCheckParams }