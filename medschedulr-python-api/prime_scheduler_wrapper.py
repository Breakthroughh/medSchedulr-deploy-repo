#!/usr/bin/env python3
"""
Wrapper for primeVersion2.py that accepts JSON input and returns JSON output
This preserves all the original logic and constraints from the fine-tuned scheduler
"""

import cvxpy as cp
import numpy as np
import pandas as pd
import datetime
import math
import json
import sys
import logging
from typing import Dict, List, Any, Tuple

logger = logging.getLogger(__name__)

# Penalty weight constants
STANDBY_REST_PENALTY_WEIGHT = 1000    # Heavy penalty for rest violations
STANDBY_MISMATCH_PENALTY_WEIGHT = 2000  # Even heavier penalty for different doctors

# --------------------------------------------------------------------------------
# Utility to compute full months difference between two dates
def months_since(start_date, end_date):
    """
    Return the number of whole months between start_date and end_date.
    """
    return (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month)

# --------------------------------------------------------------------------------
def check_standby_pairing_feasibility(availability, date_list, doctors):
    """Check if Saturday/Sunday pairing is possible for Standby Oncall"""
    warnings = []
    pairing_relaxed = False
    
    for i in range(len(date_list)-1):
        current_date = date_list[i]
        next_date = date_list[i+1]
        
        # Check if this is a Sat->Sun pair
        if current_date.weekday() == 5 and next_date.weekday() == 6:  # Sat->Sun
            sat_doctors = set()
            sun_doctors = set()
            
            for d in doctors:
                if availability.get((d, i, 'Standby Oncall'), False):
                    sat_doctors.add(d)
                if availability.get((d, i+1, 'Standby Oncall'), False):
                    sun_doctors.add(d)
            
            intersection = sat_doctors.intersection(sun_doctors)
            
            if not intersection:
                warning = f"Standby Oncall pairing will be relaxed for {current_date.strftime('%Y-%m-%d')}->{next_date.strftime('%Y-%m-%d')}: no doctors available both days"
                warnings.append(warning)
                pairing_relaxed = True
                logger.warning(f"⚠️  {warning}")
                logger.info(f"    Saturday available: {sorted(sat_doctors)}")
                logger.info(f"    Sunday available: {sorted(sun_doctors)}")
            else:
                logger.info(f"✅ Standby Oncall pairing feasible for {current_date.strftime('%Y-%m-%d')}->{next_date.strftime('%Y-%m-%d')}: {len(intersection)} doctors available both days ({sorted(intersection)})")
    
    return warnings, pairing_relaxed

# --------------------------------------------------------------------------------
def run_prime_scheduler(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main function that runs the prime scheduler with JSON input/output
    
    Args:
        config: Dictionary containing:
            - roster_start: Start date string (YYYY-MM-DD)
            - roster_end: End date string (YYYY-MM-DD)  
            - doctors: List of doctor info dicts
            - units: List of unit info dicts
            - posts_weekday: List of weekday posts
            - posts_weekend: List of weekend posts
            - availability: List of availability records
            - solver_config: Solver parameters (lambda weights, etc.)
    
    Returns:
        Dictionary containing schedule results
    """
    try:
        # Parse input dates
        roster_start = datetime.datetime.strptime(config['roster_start'], '%Y-%m-%d').date()
        roster_end = datetime.datetime.strptime(config['roster_end'], '%Y-%m-%d').date()
        
        # Build the list of dates in the roster period
        date_list = []
        current = roster_start
        while current <= roster_end:
            date_list.append(current)
            current += datetime.timedelta(days=1)
        
        logger.info(f"Processing roster period: {roster_start} to {roster_end} ({len(date_list)} days)")
        
        # Extract clinic days configuration from units
        clinic_days = {}
        for unit in config['units']:
            clinic_days[unit['name']] = unit['clinic_days']
        
        # Extract posts configuration  
        posts_weekday = config['posts_weekday'].copy()
        posts_weekend = config['posts_weekend']
        
        # Add clinic posts to weekday posts (clinics only happen on weekdays)
        for unit_name in clinic_days.keys():
            clinic_post = f"clinic:{unit_name}"
            if clinic_post not in posts_weekday:
                posts_weekday.append(clinic_post)
        
        logger.info(f"Added {len(clinic_days)} clinic posts to weekday posts")
        logger.info(f"Final posts_weekday: {posts_weekday}")
        
        # On-call posts for rest/spacing logic (include wards, ED, and standby, but NOT clinics)
        oncall_posts = set(posts_weekday + posts_weekend) - {f"clinic:{u}" for u in clinic_days.keys()}
        
        # Extract doctor information and build doctor_info dict
        doctors = []
        doctor_info = {}
        
        for doc in config['doctors']:
            doctors.append(doc['id'])
            doctor_info[doc['id']] = {
                "unit": doc['unit'],
                "category": doc['category'],
                "last_standby": datetime.datetime.strptime(doc['last_standby'], '%Y-%m-%d').date() if doc['last_standby'] else None,
                "workload": doc['workload']
            }
        
        # Extract enhanced workload data - ALWAYS provided now
        workload_data = {}
        if 'workload_data' in config and config['workload_data']:
            for wd in config['workload_data']:
                workload_data[wd['doctor_id']] = {
                    "weekday_oncalls_3m": wd['weekday_oncalls_3m'],
                    "weekend_oncalls_3m": wd['weekend_oncalls_3m'],
                    "ed_shifts_3m": wd['ed_shifts_3m'],
                    "days_since_last_standby": wd['days_since_last_standby'],
                    "standby_count_12m": wd['standby_count_12m'],
                    "standby_count_3m": wd['standby_count_3m']
                }
            logger.info(f"Enhanced workload data loaded for {len(workload_data)} doctors")
        else:
            # Ensure zero data for all doctors if no workload data provided
            for d in doctors:
                workload_data[d] = {
                    "weekday_oncalls_3m": 0,
                    "weekend_oncalls_3m": 0,
                    "ed_shifts_3m": 0,
                    "days_since_last_standby": 9999,
                    "standby_count_12m": 0,
                    "standby_count_3m": 0
                }
            logger.info(f"No workload data provided - using zeros for {len(workload_data)} doctors")
        
        logger.info(f"Processing {len(doctors)} doctors across {len(clinic_days)} units")
        
        # Build posts_by_day mapping based on weekday/weekend of each date
        posts_by_day = {}
        for idx, date in enumerate(date_list):
            posts_by_day[idx] = posts_weekend if date.weekday() >= 5 else posts_weekday
        
        # Sets for CVXPY
        D = doctors
        S = list(range(len(date_list)))
        
        # Precompute unit->doctor list (used in per-unit/day soft cap)
        units = list(clinic_days.keys())
        unit_to_docs = {u: [d for d in D if doctor_info[d]['unit'] == u] for u in units}
        
        # Convert availability data to lookup dict
        availability = {}
        for avail in config['availability']:
            # Convert date string to date index
            avail_date = datetime.datetime.strptime(avail['date'], '%Y-%m-%d').date()
            if avail_date in date_list:
                date_idx = date_list.index(avail_date)
                key = (avail['doctor_id'], date_idx, avail['post'])
                availability[key] = avail['available']
        
        # Fill in missing availability with False (not available)  
        # Special handling for clinic posts - only available for doctors in the right unit
        for d in D:
            for s in S:
                for t in posts_by_day[s]:
                    if (d, s, t) not in availability:
                        # For clinic posts, check if doctor is in the right unit
                        if t.startswith("clinic:"):
                            unit_name = t.split(":", 1)[1]
                            doctor_unit = doctor_info[d]["unit"]
                            # Only make available if on clinic day and in right unit
                            if (doctor_unit == unit_name and 
                                date_list[s].weekday() in clinic_days.get(unit_name, [])):
                                availability[(d, s, t)] = True
                            else:
                                availability[(d, s, t)] = False
                        else:
                            # Non-clinic posts default to False
                            availability[(d, s, t)] = False
        
        # REMOVED: No longer force D[0] availability - rely on Phase 2 relaxation instead
        # Check for posts with no available doctors (will be handled by Phase 2 slack)
        for s in S:
            for t in posts_by_day[s]:
                available_doctors = [d for d in D if availability.get((d, s, t), False)]
                if not available_doctors:
                    logger.warning(f"⚠️  No doctors available for {t} on day {s} ({date_list[s]}) - will use Phase 2 relaxation")
        
        logger.info(f"Availability records: {len([k for k, v in availability.items() if v])}/{len(availability)} available")
        
        # Debug: Log availability breakdown by post
        post_availability = {}
        for (d, s, t), avail in availability.items():
            if t not in post_availability:
                post_availability[t] = {'available': 0, 'total': 0}
            post_availability[t]['total'] += 1
            if avail:
                post_availability[t]['available'] += 1
        
        logger.info("Post availability breakdown:")
        for post, counts in post_availability.items():
            logger.info(f"  {post}: {counts['available']}/{counts['total']} available")
        
        # Debug: Log weekend Standby Oncall specifically
        standby_weekend_available = []
        for s in S:
            if date_list[s].weekday() >= 5:  # Weekend
                for d in D:
                    if availability.get((d, s, "Standby Oncall"), False):
                        standby_weekend_available.append((d, date_list[s]))
        
        logger.info(f"Standby Oncall weekend availability: {len(standby_weekend_available)} slots")
        if standby_weekend_available:
            logger.info(f"  Available doctors: {[f'{d} on {date}' for d, date in standby_weekend_available[:5]]}")
        
        # Log Standby Oncall weekend availability for the new constraint system
        pairing_warnings = []  # Keep for compatibility
        
        # Extract solver configuration
        solver_config = config['solver_config']
        lambda_before_clinic = solver_config.get('clinicPenaltyBefore', 10)
        lambda_same_clinic = solver_config.get('clinicPenaltySame', 50)
        lambda_after_clinic = solver_config.get('clinicPenaltyAfter', 5)
        lambda_rest = solver_config.get('lambdaRest', 3)
        lambda_gap = solver_config.get('lambdaGap', 1)
        lambda_ED = solver_config.get('lambdaED', 6)
        lambda_standby = solver_config.get('lambdaStandby', 5)
        lambda_min_one = solver_config.get('lambdaMinOne', 10)
        lambda_reg_weekend = solver_config.get('lambdaRegWeekend', 2)
        lambda_unit_over = solver_config.get('lambdaUnitOver', 25)
        lambda_junior_ward = solver_config.get('lambdaJuniorWard', 6)
        BIG_M = solver_config.get('bigM', 10000.0)
        solver_timeout = solver_config.get('solverTimeoutSeconds', 600)
        
        # --------------------------------------------------------------------------------
        # Identify weekend pairs (Sat->Sun)
        weekend_pairs = []
        for s in range(len(date_list) - 1):
            current_date = date_list[s]
            next_date = date_list[s+1]
            if current_date.weekday() == 5 and next_date.weekday() == 6:  # Sat->Sun
                weekend_pairs.append((s, s+1))
        
        logger.info(f"🗓️  Found {len(weekend_pairs)} weekend pairs for Standby Oncall constraint")
        for i, (sat_day, sun_day) in enumerate(weekend_pairs):
            logger.info(f"   Weekend {i}: {date_list[sat_day]} -> {date_list[sun_day]}")
        
        # Helper that builds & solves the model
        def build_and_solve(RELAX: bool):
            # === Decision variables ===
            x = {(d, s, t): cp.Variable(boolean=True)
                 for d in D for s in S for t in posts_by_day[s]
                 if availability.get((d, s, t), False)}  # Only create vars where available
            
            # === STANDBY WEEKEND BINARY INDICATORS ===
            # y[d, w] = 1 if doctor d is assigned Standby for weekend w (both Sat and Sun)
            y = {(d, w): cp.Variable(boolean=True) 
                 for d in D for w in range(len(weekend_pairs))}
            
            # === Soft constraint variables ===
            rest_violation = {(d, s): cp.Variable(boolean=True)
                              for d in D for s in range(len(date_list) - 1)}  # ALL adjacent pairs
            z_gap = {(d, s): cp.Variable(boolean=True)
                     for d in D for s in S if s <= len(date_list) - 3}
            min_one_slack = {d: cp.Variable(boolean=True)
                             for d in D if doctor_info[d]["category"] != "floater"}
            
            # Multiple weekend penalty variables
            multiple_weekend_penalty = {d: cp.Variable(nonneg=True) for d in D}
            
            # Initialize penalty terms
            penalty_terms = []
            
            # === CONSTRAINTS ===
            constraints = []
            
            # === HARD/SOFT SPLIT by phase ===
            if RELAX:
                logger.info("Phase 2: Relaxed constraints with Big-M penalties")
                # Each post should be covered (soft with slack)
                for s in S:
                    for t in posts_by_day[s]:
                        assigned_vars = [x[d, s, t] for d in D if (d, s, t) in x]
                        if assigned_vars:
                            slack = cp.Variable(nonneg=True)
                            penalty_terms.append(BIG_M * slack)
                            constraints.append(cp.sum(assigned_vars) + slack >= 1)
            else:
                logger.info("Phase 1: Strict constraints")
                # Each post must be covered (hard)
                for s in S:
                    for t in posts_by_day[s]:
                        assigned_vars = [x[d, s, t] for d in D if (d, s, t) in x]
                        if assigned_vars:
                            constraints.append(cp.sum(assigned_vars) == 1)
            
            # Each doctor works at most one post per day (always hard)
            for d in D:
                for s in S:
                    day_vars = [x[d, s, t] for t in posts_by_day[s] if (d, s, t) in x]
                    if day_vars:
                        constraints.append(cp.sum(day_vars) <= 1)
            
            # === CLINIC ASSIGNMENT CONSTRAINTS ===
            # Each unit must have exactly 1 doctor assigned to clinic on each clinic day
            for u, weekdays in clinic_days.items():
                clinic_post = f"clinic:{u}"
                unit_docs = [d for d in D if doctor_info[d]["unit"] == u]
                
                for s, date in enumerate(date_list):
                    if date.weekday() in weekdays and clinic_post in posts_by_day[s]:
                        clinic_vars = [x[d, s, clinic_post] for d in unit_docs if (d, s, clinic_post) in x]
                        if clinic_vars:
                            if RELAX:
                                # Soft constraint with slack for clinic coverage
                                clinic_slack = cp.Variable(nonneg=True)
                                penalty_terms.append(BIG_M * clinic_slack)
                                constraints.append(cp.sum(clinic_vars) + clinic_slack >= 1)
                            else:
                                # Hard constraint: exactly 1 doctor from unit must do clinic
                                constraints.append(cp.sum(clinic_vars) == 1)
            
            # === LINEAR STANDBY ONCALL WEEKEND CONSTRAINTS ===
            
            # 1. Link weekend binary indicators to Saturday/Sunday assignments via AND linearization
            for w, (sat_day, sun_day) in enumerate(weekend_pairs):
                for d in D:
                    if (d, w) in y:
                        # Standard AND linearization: y[d,w] = 1 iff both Sat and Sun assignments = 1
                        sat_var = x.get((d, sat_day, "Standby Oncall"), None)
                        sun_var = x.get((d, sun_day, "Standby Oncall"), None)
                        
                        if sat_var is not None and sun_var is not None:
                            # y[d,w] <= x[d,sat] and y[d,w] <= x[d,sun]  
                            constraints.append(y[d, w] <= sat_var)
                            constraints.append(y[d, w] <= sun_var)
                            # y[d,w] >= x[d,sat] + x[d,sun] - 1
                            constraints.append(y[d, w] >= sat_var + sun_var - 1)
                        else:
                            # If doctor not available for both days, y[d,w] = 0
                            constraints.append(y[d, w] == 0)
            
            # 2. Enforce Saturday = Sunday pairing via two linear inequalities  
            for w, (sat_day, sun_day) in enumerate(weekend_pairs):
                sat_assignments = [x[d, sat_day, "Standby Oncall"] for d in D if (d, sat_day, "Standby Oncall") in x]
                sun_assignments = [x[d, sun_day, "Standby Oncall"] for d in D if (d, sun_day, "Standby Oncall") in x]
                
                if sat_assignments and sun_assignments:
                    # Same doctor must do both Saturday and Sunday
                    for d in D:
                        sat_var = x.get((d, sat_day, "Standby Oncall"), None)
                        sun_var = x.get((d, sun_day, "Standby Oncall"), None)
                        if sat_var is not None and sun_var is not None:
                            constraints.append(sat_var == sun_var)  # Same doctor both days
            
            # 3. Cooldown constraint: y[d,w] + y[d,w+1] <= 1 (no consecutive weekends)
            for d in D:
                for w in range(len(weekend_pairs) - 1):
                    if (d, w) in y and (d, w+1) in y:
                        constraints.append(y[d, w] + y[d, w+1] <= 1)
            
            # 4. Monthly cap: at most 1 Standby weekend per doctor per period
            for d in D:
                weekend_vars = [y[d, w] for w in range(len(weekend_pairs)) if (d, w) in y]
                if weekend_vars:
                    constraints.append(cp.sum(weekend_vars) <= 1)
            
            # 5. Multiple weekend penalty: k[d] >= sum(y[d,w]) - 1
            for d in D:
                weekend_vars = [y[d, w] for w in range(len(weekend_pairs)) if (d, w) in y]
                if weekend_vars and d in multiple_weekend_penalty:
                    constraints.append(multiple_weekend_penalty[d] >= cp.sum(weekend_vars) - 1)
                    penalty_terms.append(1000 * multiple_weekend_penalty[d])  # Penalty for 2nd+ weekend
            
            # === FIXED: REST CONSTRAINTS (corrected from >= 1 to <= 1 + slack) ===
            for d in D:
                for s in range(len(date_list) - 1):  # All adjacent pairs
                    oncall_today = [x[d, s, t] for t in posts_by_day[s] 
                                   if t in oncall_posts and (d, s, t) in x]
                    oncall_tomorrow = [x[d, s+1, t] for t in posts_by_day[s+1] 
                                      if t in oncall_posts and (d, s+1, t) in x]
                    
                    if oncall_today and oncall_tomorrow:
                        # Check if this is a Standby weekend pair (already handled above)
                        is_standby_weekend = (
                            date_list[s].weekday() == 5 and date_list[s+1].weekday() == 6 and
                            any(t == "Standby Oncall" for t in posts_by_day[s]) and
                            any(t == "Standby Oncall" for t in posts_by_day[s+1])
                        )
                        
                        if is_standby_weekend:
                            # Standby weekend rest is handled by the pairing constraint above
                            # Only apply rest constraint to non-Standby posts
                            non_standby_today = [x[d, s, t] for t in posts_by_day[s] 
                                               if t in oncall_posts and t != "Standby Oncall" and (d, s, t) in x]
                            non_standby_tomorrow = [x[d, s+1, t] for t in posts_by_day[s+1] 
                                                  if t in oncall_posts and t != "Standby Oncall" and (d, s+1, t) in x]
                            
                            if non_standby_today and non_standby_tomorrow:
                                if (d, s) in rest_violation:
                                    # FIXED: Soft constraint sum(today) + sum(tomorrow) <= 1 + violation
                                    constraints.append(
                                        cp.sum(non_standby_today) + cp.sum(non_standby_tomorrow) <= 1 + rest_violation[d, s]
                                    )
                                    penalty_terms.append(lambda_rest * rest_violation[d, s])
                                else:
                                    # Hard constraint 
                                    constraints.append(cp.sum(non_standby_today) + cp.sum(non_standby_tomorrow) <= 1)
                        else:
                            # Regular rest constraint for all non-weekend-Standby adjacent pairs
                            if (d, s) in rest_violation:
                                # FIXED: Corrected constraint sum(today) + sum(tomorrow) <= 1 + violation
                                constraints.append(
                                    cp.sum(oncall_today) + cp.sum(oncall_tomorrow) <= 1 + rest_violation[d, s]
                                )
                                penalty_terms.append(lambda_rest * rest_violation[d, s])
                            else:
                                # Hard constraint
                                constraints.append(cp.sum(oncall_today) + cp.sum(oncall_tomorrow) <= 1)
            
            # === CLINIC DAY PENALTIES ===
            for d in D:
                unit = doctor_info[d]["unit"]
                days_for_unit = clinic_days.get(unit, [])
                for s, date in enumerate(date_list):
                    if date.weekday() in days_for_unit:
                        for delta in (-1, 0, 1):
                            idx = s + delta
                            if 0 <= idx < len(date_list):
                                for t in posts_by_day[idx]:
                                    if t in oncall_posts and (d, idx, t) in x:
                                        if delta == -1:
                                            penalty_terms.append(lambda_before_clinic * x[d, idx, t])
                                        elif delta == 0:
                                            penalty_terms.append(lambda_same_clinic * x[d, idx, t])
                                        else:  # +1
                                            penalty_terms.append(lambda_after_clinic * x[d, idx, t])
            
            # === WORKLOAD-BASED STANDBY ONCALL PENALTIES ===
            
            # Apply penalties based on historical workload and recency 
            for d in D:
                wd = workload_data.get(d, {
                    "standby_count_12m": 0,
                    "standby_count_3m": 0,
                    "days_since_last_standby": 9999
                })
                
                # Calculate penalty multiplier based on workload history
                penalty_multiplier = lambda_standby  # Base penalty
                
                # HEAVY penalty if doctor has done Standby in last 12 months
                if wd['standby_count_12m'] > 0:
                    penalty_multiplier += 5000  # Make it very unlikely
                    logger.debug(f"Heavy penalty for {d}: {wd['standby_count_12m']} standby in 12m")
                
                # Medium penalty for recent standby (3 months)
                elif wd['standby_count_3m'] > 0:
                    penalty_multiplier += 2000
                
                # Penalty based on recency (more recent = higher penalty)
                elif wd['days_since_last_standby'] < 365:
                    recency_penalty = max(0, (365 - wd['days_since_last_standby']) * 5)
                    penalty_multiplier += recency_penalty
                
                # Reward doctors who haven't done standby in a long time
                elif wd['days_since_last_standby'] > 365:
                    reward = min(200, (wd['days_since_last_standby'] - 365) / 5)
                    penalty_multiplier = max(1, penalty_multiplier - reward)  # Don't go negative
                
                # Apply penalty to all Standby assignments for this doctor
                standby_vars = [x[d, s, t] for s in S for t in posts_by_day[s] 
                               if t == "Standby Oncall" and (d, s, t) in x]
                for var in standby_vars:
                    penalty_terms.append(penalty_multiplier * var)
            
            # === OTHER PENALTIES ===
            
            # Registrar weekend penalty
            for (d, s, t) in x.keys():
                if (doctor_info[d]["category"] == "registrar" 
                    and date_list[s].weekday() >= 5 
                    and t in oncall_posts
                    and t != "Standby Oncall"):  # Don't double-penalize standby
                    penalty_terms.append(lambda_reg_weekend * x[d, s, t])
            
            # Junior ward penalty
            for (d, s, t) in x.keys():
                if (doctor_info[d]["category"] == "junior" 
                    and t.startswith("Ward")):
                    penalty_terms.append(lambda_junior_ward * x[d, s, t])
            
            # ED assignment penalties (seniors/registrars prefer not to do ED)
            for (d, s, t) in x.keys():
                if (doctor_info[d]["category"] in ["senior", "registrar"] 
                    and t.startswith("ED")):
                    penalty_terms.append(lambda_ED * x[d, s, t])
            
            # Minimum one assignment for non-floaters
            for d in D:
                if doctor_info[d]["category"] != "floater" and d in min_one_slack:
                    total_assignments = cp.sum([x[d, s, t] for s in S for t in posts_by_day[s] if (d, s, t) in x])
                    constraints.append(total_assignments + min_one_slack[d] >= 1)
                    penalty_terms.append(lambda_min_one * min_one_slack[d])
            
            # Gap penalties (reward 3-day gaps)
            for d in D:
                for s in range(len(date_list) - 2):
                    if (d, s) in z_gap:
                        oncall_today = [x[d, s, t] for t in posts_by_day[s] if t in oncall_posts and (d, s, t) in x]
                        oncall_plus3 = [x[d, s+2, t] for t in posts_by_day[s+2] if t in oncall_posts and (d, s+2, t) in x]
                        
                        if oncall_today and oncall_plus3:
                            # z_gap[d,s] = 1 if both today and +2 days have oncall assignments
                            constraints.append(z_gap[d, s] >= cp.sum(oncall_today) + cp.sum(oncall_plus3) - 1)
                            penalty_terms.append(-lambda_gap * z_gap[d, s])  # Negative = reward
            
            # Unit over-coverage penalty (25% soft cap)
            for u in units:
                unit_docs = unit_to_docs[u]
                if len(unit_docs) > 0:
                    cap = max(1, math.ceil(0.25 * len(unit_docs)))
                    for s, date in enumerate(date_list):
                        if date.weekday() not in clinic_days.get(u, []):  # Non-clinic days
                            unit_assignments = [x[d, s, t] for d in unit_docs for t in posts_by_day[s] if (d, s, t) in x]
                            if unit_assignments:
                                over_slack = cp.Variable(nonneg=True)
                                constraints.append(cp.sum(unit_assignments) - over_slack <= cap)
                                penalty_terms.append(lambda_unit_over * over_slack)
            
            # === OBJECTIVE ===
            if penalty_terms:
                objective = cp.Minimize(cp.sum(penalty_terms))
            else:
                # Fallback objective
                total_assignments = cp.sum([x[d, s, t] for (d, s, t) in x.keys()])
                objective = cp.Minimize(total_assignments)
            
            # === SOLVE ===
            problem = cp.Problem(objective, constraints)
            logger.info(f"Problem has {len(x)} variables, {len(constraints)} constraints")
            
            # Use CBC solver exclusively
            if 'CBC' not in cp.installed_solvers():
                raise Exception("CBC solver is required but not installed")
            
            logger.info("Solving with CBC solver...")
            problem.solve(solver=cp.CBC, verbose=False, maximumSeconds=solver_timeout)
            
            logger.info(f"Solver status: {problem.status}")
            if problem.value is not None:
                logger.info(f"Objective value: {problem.value}")
            
            return problem, x, y  # Return weekend binary indicators instead of mismatch penalties
        
        # --------------------------------------------------------------------------------
        # RUN PHASE 1 (strict constraints)
        logger.info("Starting Phase 1...")
        problem1, x1, y1 = build_and_solve(RELAX=False)
        
        if problem1.status == cp.OPTIMAL:
            logger.info("Phase 1 succeeded - using optimal solution")
            final_problem, final_x, final_y = problem1, x1, y1
        else:
            logger.info("Phase 1 failed - running Phase 2...")
            problem2, x2, y2 = build_and_solve(RELAX=True)
            final_problem, final_x, final_y = problem2, x2, y2
        
        # === EXTRACT RESULTS ===
        results = []
        
        if final_problem.status in [cp.OPTIMAL, cp.OPTIMAL_INACCURATE]:
            # Log weekend binary indicator results
            weekend_assignments = []
            for d in D:
                for w in range(len(weekend_pairs)):
                    if (d, w) in final_y and final_y[d, w].value is not None and final_y[d, w].value > 0.5:
                        weekend_assignments.append((d, w, weekend_pairs[w]))
            
            if weekend_assignments:
                logger.info(f"Weekend Standby assignments: {len(weekend_assignments)}")
                for d, w, (sat_day, sun_day) in weekend_assignments:
                    logger.info(f"  Doctor {d} -> Weekend {w} ({date_list[sat_day]} to {date_list[sun_day]})")
            
            # Extract assignments (NO special Standby Oncall handling - let post-processing handle it)
            for (d, s, t), var in final_x.items():
                if var.value is not None and var.value > 0.5:  # Binary variable threshold
                    current_date = date_list[s]
                    results.append({
                        "doctor": d,
                        "date": current_date.isoformat(),
                        "post": t
                    })
            
            # Clinic assignments are now handled by the solver directly - no post-processing needed
            
            logger.info(f"Generated schedule with {len(results)} assignments")
            
            # Log assignment breakdown by type
            assignment_counts = {}
            clinic_assignments = []
            standby_assignments = []
            
            for assignment in results:
                post = assignment["post"]
                if post.startswith("clinic:"):
                    clinic_assignments.append(assignment)
                elif post == "Standby Oncall":
                    standby_assignments.append(assignment)
                
                assignment_counts[post] = assignment_counts.get(post, 0) + 1
            
            logger.info(f"Assignment breakdown: {assignment_counts}")
            logger.info(f"Clinic assignments: {len(clinic_assignments)} (distinct unit/date pairs)")
            logger.info(f"Standby Oncall assignments: {len(standby_assignments)}")
            for assignment in standby_assignments:
                date_obj = datetime.datetime.strptime(assignment["date"], '%Y-%m-%d').date()
                weekday_name = date_obj.strftime('%A')
                doctor_id = assignment['doctor']
                
                # Log workload context for assigned doctor
                workload_context = ""
                if doctor_id in workload_data:
                    wd = workload_data[doctor_id]
                    workload_context = f" (12m_standby: {wd['standby_count_12m']}, days_since: {wd['days_since_last_standby']})"
                
                logger.info(f"  {assignment['doctor']} -> {assignment['date']} ({weekday_name}){workload_context}")
            
            # Log doctors who were eligible but not assigned
            if workload_data:
                eligible_doctors = [d for d in D if workload_data.get(d, {}).get('standby_count_12m', 0) == 0]
                assigned_doctors = [a['doctor'] for a in standby_assignments]
                not_assigned = [d for d in eligible_doctors if d not in assigned_doctors]
                if not_assigned:
                    logger.info(f"Eligible doctors not assigned Standby: {not_assigned[:5]}")  # Show first 5
                
        else:
            logger.warning(f"Solver failed with status: {final_problem.status}")
        
        # === CALCULATE STATISTICS ===
        stats = {
            "total_assignments": len(results),
            "doctors_used": len(set(item["doctor"] for item in results)),
            "posts_filled": {},
            "assignments_by_date": {},
            "workload_by_doctor": {},
            "solver_status": str(final_problem.status),
            "objective_value": final_problem.value if final_problem.value is not None else None
        }
        
        # Calculate detailed statistics
        for item in results:
            # Posts filled
            post = item["post"]
            if post not in stats["posts_filled"]:
                stats["posts_filled"][post] = 0
            stats["posts_filled"][post] += 1
            
            # Assignments by date
            date = item["date"]
            if date not in stats["assignments_by_date"]:
                stats["assignments_by_date"][date] = 0
            stats["assignments_by_date"][date] += 1
            
            # Workload by doctor
            doctor = item["doctor"]
            if doctor not in stats["workload_by_doctor"]:
                stats["workload_by_doctor"][doctor] = 0
            stats["workload_by_doctor"][doctor] += 1
        
        # Prepare final warnings
        final_warnings = pairing_warnings.copy()
        
        return {
            "schedule": results,
            "statistics": stats,
            "solver_status": str(final_problem.status),
            "objective_value": final_problem.value if final_problem.value is not None else None,
            "success": final_problem.status in [cp.OPTIMAL, cp.OPTIMAL_INACCURATE],
            "warnings": final_warnings,
            "weekend_assignments": len([d for d in D for w in range(len(weekend_pairs)) 
                                       if (d, w) in final_y and final_y[d, w].value is not None and final_y[d, w].value > 0.5]) if final_problem.status in [cp.OPTIMAL, cp.OPTIMAL_INACCURATE] else 0
        }
        
    except Exception as e:
        logger.error(f"Error in prime scheduler: {e}")
        return {
            "schedule": [],
            "statistics": {"error": str(e)},
            "solver_status": "error",
            "objective_value": None,
            "success": False,
            "error": str(e),
            "warnings": [],
            "weekend_assignments": 0
        }

if __name__ == "__main__":
    # For testing - read from stdin or file
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            config = json.load(f)
    else:
        config = json.load(sys.stdin)
    
    result = run_prime_scheduler(config)
    print(json.dumps(result, indent=2, default=str))