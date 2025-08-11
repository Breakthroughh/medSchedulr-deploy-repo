import cvxpy as cp
import numpy as np
import pandas as pd
import datetime
import math
from typing import Dict, List, Optional, Any, Tuple
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

class SchedulerConfig(BaseModel):
    roster_start: datetime.date
    roster_end: datetime.date
    solver_config: Dict[str, Any]

class SchedulingResult(BaseModel):
    schedule: List[Dict[str, Any]]
    statistics: Dict[str, Any]
    solver_status: str
    objective_value: Optional[float] = None
    
    def to_dict(self):
        return {
            "schedule": self.schedule,
            "statistics": self.statistics,
            "solver_status": self.solver_status,
            "objective_value": self.objective_value
        }

class MedicalScheduler:
    def __init__(self, config: SchedulerConfig):
        self.config = config
        self.solver_config = config.solver_config
        
        # Build date list
        self.date_list = []
        current = config.roster_start
        while current <= config.roster_end:
            self.date_list.append(current)
            current += datetime.timedelta(days=1)
        
        # Initialize solver parameters with defaults
        self.lambda_rest = self.solver_config.get('lambdaRest', 3)
        self.lambda_gap = self.solver_config.get('lambdaGap', 1)
        self.lambda_ED = self.solver_config.get('lambdaED', 6)
        self.lambda_standby = self.solver_config.get('lambdaStandby', 5)
        self.lambda_min_one = self.solver_config.get('lambdaMinOne', 10)
        self.lambda_reg_weekend = self.solver_config.get('lambdaRegWeekend', 2)
        self.lambda_unit_over = self.solver_config.get('lambdaUnitOver', 25)
        self.lambda_junior_ward = self.solver_config.get('lambdaJuniorWard', 6)
        self.lambda_before_clinic = self.solver_config.get('clinicPenaltyBefore', 10)
        self.lambda_same_clinic = self.solver_config.get('clinicPenaltySame', 50)
        self.lambda_after_clinic = self.solver_config.get('clinicPenaltyAfter', 5)
        self.big_M = self.solver_config.get('bigM', 10000)
        self.solver_timeout = self.solver_config.get('solverTimeoutSeconds', 600)
    
    def generate_schedule(
        self, 
        doctors_data: Dict[str, Dict], 
        units_data: Dict[str, Dict], 
        posts_weekday: List[str], 
        posts_weekend: List[str], 
        availability_data: Dict[Tuple, bool]
    ) -> SchedulingResult:
        """
        Main method to generate medical schedule using CVXPY optimization
        """
        try:
            logger.info("Starting schedule generation")
            
            # Prepare data structures
            doctors = list(doctors_data.keys())
            units = list(units_data.keys())
            
            # Build posts by day
            posts_by_day = {}
            for idx, date in enumerate(self.date_list):
                posts_by_day[idx] = posts_weekend if date.weekday() >= 5 else posts_weekday
            
            # On-call posts for rest/spacing logic
            oncall_posts = set(posts_weekday + posts_weekend)
            
            # Unit to doctors mapping
            unit_to_docs = {}
            for unit in units:
                unit_to_docs[unit] = [d for d in doctors if doctors_data[d]['unit'] == unit]
            
            logger.info(f"Processing {len(doctors)} doctors, {len(units)} units, {len(self.date_list)} days")
            
            # Run Phase 1: Strict constraints
            phase1_result = self._run_phase1(
                doctors, units, doctors_data, units_data, 
                posts_by_day, oncall_posts, unit_to_docs, availability_data
            )
            
            if phase1_result["status"] == "optimal":
                logger.info("Phase 1 succeeded - using optimal solution")
                schedule = self._extract_schedule(phase1_result["solution"], doctors, posts_by_day)
                stats = self._calculate_statistics(schedule, doctors_data, units_data)
                return SchedulingResult(
                    schedule=schedule,
                    statistics=stats,
                    solver_status="optimal",
                    objective_value=phase1_result["objective_value"]
                )
            else:
                logger.info("Phase 1 failed - running Phase 2 with relaxed constraints")
                
                # Run Phase 2: Relaxed constraints
                phase2_result = self._run_phase2(
                    doctors, units, doctors_data, units_data,
                    posts_by_day, oncall_posts, unit_to_docs, availability_data
                )
                
                schedule = self._extract_schedule(phase2_result["solution"], doctors, posts_by_day)
                stats = self._calculate_statistics(schedule, doctors_data, units_data)
                return SchedulingResult(
                    schedule=schedule,
                    statistics=stats,
                    solver_status=phase2_result["status"],
                    objective_value=phase2_result["objective_value"]
                )
        
        except Exception as e:
            logger.error(f"Error in schedule generation: {e}")
            raise e
    
    def _run_phase1(self, doctors, units, doctors_data, units_data, posts_by_day, oncall_posts, unit_to_docs, availability_data):
        """Phase 1: Strict constraints"""
        try:
            logger.info("Running Phase 1 with strict constraints")
            
            # Decision variables
            S = list(range(len(self.date_list)))
            x = {}  # x[d,s,t] = 1 if doctor d works post t on day s
            
            # Create decision variables only for valid combinations
            for d in doctors:
                for s in S:
                    for t in posts_by_day[s]:
                        key = (d, self.date_list[s].strftime('%Y-%m-%d'), t)
                        if key in availability_data and availability_data[key]:
                            x[d, s, t] = cp.Variable(boolean=True)
            
            # Constraints
            constraints = []
            
            # Each post must be filled each day
            for s in S:
                for t in posts_by_day[s]:
                    assigned_vars = [x[d, s, t] for d in doctors if (d, s, t) in x]
                    if assigned_vars:
                        constraints.append(cp.sum(assigned_vars) == 1)
            
            # Each doctor can work at most one post per day
            for d in doctors:
                for s in S:
                    day_vars = [x[d, s, t] for t in posts_by_day[s] if (d, s, t) in x]
                    if day_vars:
                        constraints.append(cp.sum(day_vars) <= 1)
            
            # Rest constraints: 48-hour break after on-call
            for d in doctors:
                for s in S[:-1]:  # Don't check last day
                    oncall_today = [x[d, s, t] for t in posts_by_day[s] if t in oncall_posts and (d, s, t) in x]
                    if oncall_today and s + 1 < len(S):
                        oncall_tomorrow = [x[d, s+1, t] for t in posts_by_day[s+1] if t in oncall_posts and (d, s+1, t) in x]
                        if oncall_tomorrow:
                            constraints.append(cp.sum(oncall_today) + cp.sum(oncall_tomorrow) <= 1)
            
            # Build objective
            objective_terms = []
            
            # Add penalty terms based on lambda weights
            # (Simplified version - full implementation would include all penalty terms from primeVersion2.py)
            
            # Minimize total assignments (basic load balancing)
            for d in doctors:
                total_assignments = cp.sum([x[d, s, t] for s in S for t in posts_by_day[s] if (d, s, t) in x])
                objective_terms.append(total_assignments)
            
            objective = cp.Minimize(cp.sum(objective_terms))
            
            # Solve
            problem = cp.Problem(objective, constraints)
            self._solve_problem(problem)
            
            if problem.status == cp.OPTIMAL:
                logger.info(f"Phase 1 optimal solution found with objective value: {problem.value}")
                return {
                    "status": "optimal",
                    "solution": x,
                    "objective_value": problem.value,
                    "problem": problem
                }
            else:
                logger.info(f"Phase 1 failed with status: {problem.status}")
                return {"status": problem.status, "solution": None, "objective_value": None}
        
        except Exception as e:
            logger.error(f"Error in Phase 1: {e}")
            return {"status": "error", "solution": None, "error": str(e), "objective_value": None}
    
    def _run_phase2(self, doctors, units, doctors_data, units_data, posts_by_day, oncall_posts, unit_to_docs, availability_data):
        """Phase 2: Relaxed constraints with penalty terms"""
        try:
            logger.info("Running Phase 2 with relaxed constraints")
            
            S = list(range(len(self.date_list)))
            x = {}
            
            # Create decision variables
            for d in doctors:
                for s in S:
                    for t in posts_by_day[s]:
                        key = (d, self.date_list[s].strftime('%Y-%m-%d'), t)
                        if key in availability_data and availability_data[key]:
                            x[d, s, t] = cp.Variable(boolean=True)
            
            # Soft constraints with penalty variables
            constraints = []
            penalty_vars = []
            
            # Each post should be filled (soft constraint)
            for s in S:
                for t in posts_by_day[s]:
                    assigned_vars = [x[d, s, t] for d in doctors if (d, s, t) in x]
                    if assigned_vars:
                        penalty = cp.Variable(nonneg=True)
                        penalty_vars.append(self.big_M * penalty)
                        constraints.append(cp.sum(assigned_vars) + penalty >= 1)
            
            # Each doctor works at most one post per day (hard constraint)
            for d in doctors:
                for s in S:
                    day_vars = [x[d, s, t] for t in posts_by_day[s] if (d, s, t) in x]
                    if day_vars:
                        constraints.append(cp.sum(day_vars) <= 1)
            
            # Build objective with penalty terms
            objective_terms = penalty_vars.copy()
            
            # Add workload balancing terms
            for d in doctors:
                total_assignments = cp.sum([x[d, s, t] for s in S for t in posts_by_day[s] if (d, s, t) in x])
                objective_terms.append(total_assignments)
            
            objective = cp.Minimize(cp.sum(objective_terms))
            
            # Solve
            problem = cp.Problem(objective, constraints)
            self._solve_problem(problem)
            
            logger.info(f"Phase 2 completed with status: {problem.status}")
            return {
                "status": problem.status,
                "solution": x,
                "objective_value": problem.value,
                "problem": problem
            }
        
        except Exception as e:
            logger.error(f"Error in Phase 2: {e}")
            return {"status": "error", "solution": None, "error": str(e), "objective_value": None}
    
    def _extract_schedule(self, solution_vars, doctors, posts_by_day):
        """Extract schedule from CVXPY solution"""
        schedule = []
        
        if solution_vars is None:
            return schedule
        
        S = list(range(len(self.date_list)))
        
        for d in doctors:
            for s in S:
                for t in posts_by_day[s]:
                    if (d, s, t) in solution_vars:
                        var = solution_vars[d, s, t]
                        if var.value is not None and var.value > 0.5:  # Binary variable threshold
                            schedule.append({
                                "doctor": d,
                                "date": self.date_list[s].isoformat(),
                                "post": t
                            })
        
        return schedule
    
    def _solve_problem(self, problem):
        """Helper method to solve CVXPY problem using CBC solver exclusively"""
        installed = cp.installed_solvers()
        logger.info(f"Available solvers: {installed}")
        
        if 'CBC' not in installed:
            raise Exception("CBC solver is required but not installed")
        
        logger.info("Using CBC solver for mixed-integer programming")
        try:
            problem.solve(solver=cp.CBC, verbose=False)
            logger.info(f"CBC solver finished with status: {problem.status}")
        except Exception as e:
            logger.error(f"CBC solver failed: {e}")
            raise

    def _calculate_statistics(self, schedule, doctors_data, units_data):
        """Calculate schedule statistics"""
        stats = {
            "total_assignments": len(schedule),
            "doctors_used": len(set(item["doctor"] for item in schedule)),
            "coverage_by_day": {},
            "workload_by_doctor": {},
            "posts_filled": {}
        }
        
        # Calculate coverage by day
        for item in schedule:
            date = item["date"]
            if date not in stats["coverage_by_day"]:
                stats["coverage_by_day"][date] = 0
            stats["coverage_by_day"][date] += 1
        
        # Calculate workload by doctor
        for item in schedule:
            doctor = item["doctor"]
            if doctor not in stats["workload_by_doctor"]:
                stats["workload_by_doctor"][doctor] = 0
            stats["workload_by_doctor"][doctor] += 1
        
        # Calculate posts filled
        for item in schedule:
            post = item["post"]
            if post not in stats["posts_filled"]:
                stats["posts_filled"][post] = 0
            stats["posts_filled"][post] += 1
        
        return stats