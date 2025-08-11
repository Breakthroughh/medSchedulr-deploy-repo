from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
import datetime
import asyncio
import logging
from prime_scheduler_wrapper import run_prime_scheduler

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MedSchedulr API", version="1.0.0")

# CORS configuration for Next.js integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for production deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for running jobs (in production, use Redis or database)
running_jobs: Dict[str, Dict] = {}

# Request/Response Models
class DoctorInfo(BaseModel):
    id: str
    name: str
    unit: str
    category: str  # floater, junior, senior, registrar
    last_standby: Optional[datetime.date] = None
    workload: Dict[str, int] = Field(default_factory=dict)

class UnitInfo(BaseModel):
    id: str
    name: str
    clinic_days: List[int]  # weekday numbers: 0=Mon, 1=Tue, etc.

class PostInfo(BaseModel):
    name: str
    is_oncall: bool = True
    is_weekend_only: bool = False

class AvailabilityRecord(BaseModel):
    doctor_id: str
    date: datetime.date
    post: str
    available: bool

class ScheduleRequest(BaseModel):
    roster_start: datetime.date
    roster_end: datetime.date
    doctors: List[DoctorInfo]
    units: List[UnitInfo]
    posts_weekday: List[str]
    posts_weekend: List[str]
    availability: List[AvailabilityRecord]
    solver_config: Dict[str, Any]  # Lambda weights and solver parameters

class ScheduleResponse(BaseModel):
    job_id: str
    status: str
    message: str

class JobStatus(BaseModel):
    job_id: str
    status: str  # pending, running, completed, failed
    progress: Optional[float] = None
    result: Optional[Dict] = None
    error: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

@app.get("/")
async def root():
    return {"message": "MedSchedulr Python API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.datetime.now()}

@app.post("/schedule/generate", response_model=ScheduleResponse)
async def generate_schedule(request: ScheduleRequest, background_tasks: BackgroundTasks):
    """
    Generate a medical schedule asynchronously
    """
    try:
        job_id = f"job_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        
        # Create job record
        running_jobs[job_id] = {
            "status": "pending",
            "progress": 0.0,
            "result": None,
            "error": None,
            "created_at": datetime.datetime.now(),
            "updated_at": datetime.datetime.now()
        }
        
        # Start background task
        background_tasks.add_task(run_scheduler, job_id, request)
        
        return ScheduleResponse(
            job_id=job_id,
            status="pending",
            message="Schedule generation started"
        )
    
    except Exception as e:
        logger.error(f"Error starting schedule generation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/schedule/status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    """
    Get the status of a running schedule generation job
    """
    if job_id not in running_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job_data = running_jobs[job_id]
    return JobStatus(
        job_id=job_id,
        status=job_data["status"],
        progress=job_data.get("progress"),
        result=job_data.get("result"),
        error=job_data.get("error"),
        created_at=job_data["created_at"],
        updated_at=job_data["updated_at"]
    )

@app.delete("/schedule/{job_id}")
async def cancel_job(job_id: str):
    """
    Cancel a running job (if possible)
    """
    if job_id not in running_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job_data = running_jobs[job_id]
    if job_data["status"] in ["pending", "running"]:
        job_data["status"] = "cancelled"
        job_data["updated_at"] = datetime.datetime.now()
        return {"message": "Job cancelled", "job_id": job_id}
    else:
        return {"message": "Job cannot be cancelled", "status": job_data["status"]}

@app.get("/schedule/jobs")
async def list_jobs():
    """
    List all jobs (for debugging/monitoring)
    """
    return {
        "jobs": [
            {
                "job_id": job_id,
                "status": job_data["status"],
                "created_at": job_data["created_at"],
                "updated_at": job_data["updated_at"]
            }
            for job_id, job_data in running_jobs.items()
        ]
    }

async def run_scheduler(job_id: str, request: ScheduleRequest):
    """
    Background task to run the medical scheduler
    """
    try:
        # Update job status
        running_jobs[job_id]["status"] = "running"
        running_jobs[job_id]["progress"] = 0.0
        running_jobs[job_id]["updated_at"] = datetime.datetime.now()
        
        logger.info(f"Starting schedule generation for job {job_id}")
        
        # Convert request to config for prime scheduler
        config = {
            "roster_start": request.roster_start.strftime('%Y-%m-%d'),
            "roster_end": request.roster_end.strftime('%Y-%m-%d'),
            "doctors": [
                {
                    "id": doctor.id,
                    "name": doctor.name,
                    "unit": doctor.unit,
                    "category": doctor.category,
                    "last_standby": doctor.last_standby.strftime('%Y-%m-%d') if doctor.last_standby else None,
                    "workload": doctor.workload
                }
                for doctor in request.doctors
            ],
            "units": [
                {
                    "name": unit.name,
                    "clinic_days": unit.clinic_days
                }
                for unit in request.units
            ],
            "posts_weekday": request.posts_weekday,
            "posts_weekend": request.posts_weekend,
            "availability": [
                {
                    "doctor_id": avail.doctor_id,
                    "date": avail.date.strftime('%Y-%m-%d'),
                    "post": avail.post,
                    "available": avail.available
                }
                for avail in request.availability
            ],
            "solver_config": request.solver_config
        }
        
        # Set up data
        running_jobs[job_id]["progress"] = 0.2
        running_jobs[job_id]["updated_at"] = datetime.datetime.now()
        
        # Run prime scheduler directly
        running_jobs[job_id]["progress"] = 0.4
        running_jobs[job_id]["updated_at"] = datetime.datetime.now()
        
        result = run_prime_scheduler(config)
        
        # Update final status
        if result.get("success", False):
            running_jobs[job_id]["status"] = "completed"
            running_jobs[job_id]["progress"] = 1.0
            running_jobs[job_id]["result"] = result
            running_jobs[job_id]["updated_at"] = datetime.datetime.now()
        else:
            running_jobs[job_id]["status"] = "failed"
            running_jobs[job_id]["error"] = result.get("error", "Unknown solver error")
            running_jobs[job_id]["updated_at"] = datetime.datetime.now()
        
        logger.info(f"Schedule generation completed for job {job_id}")
        
    except Exception as e:
        logger.error(f"Error in schedule generation for job {job_id}: {e}")
        running_jobs[job_id]["status"] = "failed"
        running_jobs[job_id]["error"] = str(e)
        running_jobs[job_id]["updated_at"] = datetime.datetime.now()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)