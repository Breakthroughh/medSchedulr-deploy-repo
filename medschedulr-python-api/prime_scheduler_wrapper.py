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

# --------------------------------------------------------------------------------
# Utility to compute full months difference between two dates
def months_since(start_date, end_date):
    """
    Return the number of whole months between start_date and end_date.
    """
    return (end_date.year - start_date.year) * 12 + (end_date.month - start_date.month)

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
        posts_weekday = config['posts_weekday']
        posts_weekend = config['posts_weekend']
        
        # On-call posts for rest/spacing logic (include wards, ED, and standby)
        oncall_posts = set(posts_weekday + posts_weekend)
        
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
        for d in D:
            for s in S:
                for t in posts_by_day[s]:
                    if (d, s, t) not in availability:
                        availability[(d, s, t)] = False
        
        # Ensure at least one doctor is available for each post on each day
        # This prevents the solver from failing when no doctors are available
        for s in S:
            for t in posts_by_day[s]:
                available_doctors = [d for d in D if availability.get((d, s, t), False)]
                if not available_doctors:
                    # If no doctors are available for this post on this day,
                    # make the first doctor available to ensure the solver can assign someone
                    logger.warning(f"No doctors available for {t} on day {s} ({date_list[s]}), making first doctor available")
                    availability[(D[0], s, t)] = True
        
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
        # Helper that builds & solves the model (adapted from original primeVersion2.py)
        def build_and_solve(RELAX: bool):
            # === Decision variables ===
            x = {(d, s, t): cp.Variable(boolean=True)
                 for d in D for s in S for t in posts_by_day[s]
                 if availability.get((d, s, t), False)}  # Only create vars where available
            
            # === Soft variables (shared) ===
            rest_violation = {(d, s): cp.Variable(boolean=True)
                              for d in D for s in S if s <= len(date_list) - 3}
            z_gap = {(d, s): cp.Variable(boolean=True)
                     for d in D for s in S if s <= len(date_list) - 3}
            min_one_slack = {d: cp.Variable(boolean=True)
                             for d in D if doctor_info[d]["category"] != "floater"}
            
            # Initialize penalty terms (will collect everything here)
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
            
            # === STANDBY ONCALL 2-DAY WEEKEND CONSTRAINT ===
            # Ensure Standby Oncall assignments are paired across Saturday-Sunday weekends
            for s in range(len(date_list) - 1):
                current_date = date_list[s]
                if current_date.weekday() == 5:  # Saturday
                    next_date = date_list[s+1]
                    if next_date.weekday() == 6:  # Sunday (ensure it's actually next day)
                        # Get all Saturday Standby Oncall variables
                        saturday_vars = [x[d, s, "Standby Oncall"] for d in D if (d, s, "Standby Oncall") in x]
                        sunday_vars = [x[d, s+1, "Standby Oncall"] for d in D if (d, s+1, "Standby Oncall") in x]
                        
                        if saturday_vars and sunday_vars:
                            # For each doctor, if they work Standby Oncall Saturday, they must work Sunday
                            for d in D:
                                sat_var = (d, s, "Standby Oncall") in x
                                sun_var = (d, s+1, "Standby Oncall") in x
                                if sat_var and sun_var:
                                    # Create equivalence: x[d, saturday] == x[d, sunday] for Standby Oncall
                                    constraints.append(x[d, s, "Standby Oncall"] == x[d, s+1, "Standby Oncall"])
            
            # === REST CONSTRAINTS (48-hour break logic) ===
            for d in D:
                for s in range(len(date_list) - 1):
                    oncall_today = [x[d, s, t] for t in posts_by_day[s] 
                                   if t in oncall_posts and (d, s, t) in x]
                    oncall_tomorrow = [x[d, s+1, t] for t in posts_by_day[s+1] 
                                      if t in oncall_posts and (d, s+1, t) in x]
                    
                    if oncall_today and oncall_tomorrow:
                        if s in rest_violation:
                            constraints.append(
                                cp.sum(oncall_today) + cp.sum(oncall_tomorrow) + rest_violation[d, s] >= 1
                            )
                            penalty_terms.append(lambda_rest * rest_violation[d, s])
                        else:
                            # Hard constraint if no rest violation var
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
            
            # === OTHER PENALTIES ===
            
            # Registrar weekend penalty
            for (d, s, t) in x.keys():
                if (doctor_info[d]["category"] == "registrar" 
                    and date_list[s].weekday() >= 5 
                    and t in oncall_posts):
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
            
            return problem, x
        
        # --------------------------------------------------------------------------------
        # RUN PHASE 1 (strict constraints)
        logger.info("Starting Phase 1...")
        problem1, x1 = build_and_solve(RELAX=False)
        
        if problem1.status == cp.OPTIMAL:
            logger.info("Phase 1 succeeded - using optimal solution")
            final_problem, final_x = problem1, x1
        else:
            logger.info("Phase 1 failed - running Phase 2...")
            problem2, x2 = build_and_solve(RELAX=True)
            final_problem, final_x = problem2, x2
        
        # === EXTRACT RESULTS ===
        results = []
        
        if final_problem.status in [cp.OPTIMAL, cp.OPTIMAL_INACCURATE]:
            # Extract assignments
            standby_weekend_assignments = set()  # Track (doctor, saturday_date) for Standby Oncall
            
            for (d, s, t), var in final_x.items():
                if var.value is not None and var.value > 0.5:  # Binary variable threshold
                    current_date = date_list[s]
                    
                    # Special handling for Standby Oncall - convert to 2-day weekend assignments
                    if t == "Standby Oncall":
                        if current_date.weekday() == 5:  # Saturday
                            weekend_key = (d, current_date.isoformat())
                            if weekend_key not in standby_weekend_assignments:
                                standby_weekend_assignments.add(weekend_key)
                                # Add Saturday assignment
                                results.append({
                                    "doctor": d,
                                    "date": current_date.isoformat(),
                                    "post": t
                                })
                                # Add Sunday assignment automatically
                                sunday_date = current_date + datetime.timedelta(days=1)
                                if sunday_date <= roster_end:
                                    results.append({
                                        "doctor": d,
                                        "date": sunday_date.isoformat(),
                                        "post": t
                                    })
                        elif current_date.weekday() == 6:  # Sunday
                            # Check if this doctor already has Saturday assignment for this weekend
                            saturday_date = current_date - datetime.timedelta(days=1)
                            weekend_key = (d, saturday_date.isoformat())
                            if weekend_key not in standby_weekend_assignments:
                                # This shouldn't happen if constraints are correct, but handle it
                                results.append({
                                    "doctor": d,
                                    "date": current_date.isoformat(),
                                    "post": t
                                })
                        else:
                            # Standby Oncall on non-weekend (shouldn't happen but handle it)
                            results.append({
                                "doctor": d,
                                "date": current_date.isoformat(),
                                "post": t
                            })
                    else:
                        # Regular post assignment
                        results.append({
                            "doctor": d,
                            "date": current_date.isoformat(),
                            "post": t
                        })
            
            # Add clinic assignments for all doctors in units on clinic days
            for u, weekdays in clinic_days.items():
                unit_docs = [d for d in D if doctor_info[d]["unit"] == u]
                for s, date in enumerate(date_list):
                    if date.weekday() in weekdays:
                        for d in unit_docs:
                            results.append({
                                "doctor": d,
                                "date": date.isoformat(),
                                "post": "clinic"
                            })
            
            logger.info(f"Generated schedule with {len(results)} assignments")
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
        
        return {
            "schedule": results,
            "statistics": stats,
            "solver_status": str(final_problem.status),
            "objective_value": final_problem.value if final_problem.value is not None else None,
            "success": final_problem.status in [cp.OPTIMAL, cp.OPTIMAL_INACCURATE]
        }
        
    except Exception as e:
        logger.error(f"Error in prime scheduler: {e}")
        return {
            "schedule": [],
            "statistics": {"error": str(e)},
            "solver_status": "error",
            "objective_value": None,
            "success": False,
            "error": str(e)
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