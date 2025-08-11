#!/usr/bin/env python3
"""
Simple test script for the MedSchedulr Python API
"""
import requests
import json
import datetime
from typing import Dict, Any

API_BASE = "http://localhost:8000"

def test_health_check():
    """Test the health endpoint"""
    try:
        response = requests.get(f"{API_BASE}/health")
        print(f"Health check: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Health check failed: {e}")
        return False

def create_sample_request() -> Dict[str, Any]:
    """Create a sample schedule request for testing"""
    return {
        "roster_start": "2025-08-01",
        "roster_end": "2025-08-07",  # One week for quick testing
        "doctors": [
            {
                "id": "doc1",
                "name": "Dr. Smith",
                "unit": "Unit1",
                "category": "senior",
                "last_standby": None,
                "workload": {"weekday": 2, "weekend": 1, "ED": 1}
            },
            {
                "id": "doc2", 
                "name": "Dr. Johnson",
                "unit": "Unit1",
                "category": "junior",
                "last_standby": None,
                "workload": {"weekday": 1, "weekend": 0, "ED": 0}
            },
            {
                "id": "doc3",
                "name": "Dr. Brown",
                "unit": "Unit2", 
                "category": "registrar",
                "last_standby": None,
                "workload": {"weekday": 3, "weekend": 2, "ED": 2}
            }
        ],
        "units": [
            {
                "id": "unit1",
                "name": "Unit1", 
                "clinic_days": [0, 4]  # Monday and Friday
            },
            {
                "id": "unit2",
                "name": "Unit2",
                "clinic_days": [1, 3]  # Tuesday and Thursday  
            }
        ],
        "posts_weekday": ["ED1", "ED2", "Ward3"],
        "posts_weekend": ["ED1", "ED2", "Ward4", "Standby"],
        "availability": [
            # Make all doctors available for all posts on all days for simplicity
            {
                "doctor_id": "doc1",
                "date": "2025-08-01", 
                "post": "ED1",
                "available": True
            },
            {
                "doctor_id": "doc1",
                "date": "2025-08-01",
                "post": "ED2", 
                "available": True
            },
            {
                "doctor_id": "doc2",
                "date": "2025-08-01",
                "post": "ED1",
                "available": True
            },
            {
                "doctor_id": "doc3", 
                "date": "2025-08-01",
                "post": "ED2",
                "available": True
            }
            # Add more availability records as needed
        ],
        "solver_config": {
            "lambdaRest": 3,
            "lambdaGap": 1,
            "lambdaED": 6,
            "lambdaStandby": 5,
            "lambdaMinOne": 10,
            "lambdaRegWeekend": 2,
            "lambdaUnitOver": 25,
            "lambdaJuniorWard": 6,
            "clinicPenaltyBefore": 10,
            "clinicPenaltySame": 50,
            "clinicPenaltyAfter": 5,
            "bigM": 10000,
            "solverTimeoutSeconds": 600
        }
    }

def test_schedule_generation():
    """Test schedule generation endpoint"""
    try:
        request_data = create_sample_request()
        print("Sending schedule generation request...")
        print(f"Request data: {json.dumps(request_data, indent=2, default=str)}")
        
        response = requests.post(f"{API_BASE}/schedule/generate", json=request_data)
        print(f"Schedule generation response: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Job started: {result}")
            return result.get("job_id")
        else:
            print(f"Error response: {response.text}")
            return None
    except Exception as e:
        print(f"Schedule generation test failed: {e}")
        return None

def test_job_status(job_id: str):
    """Test job status endpoint"""
    try:
        response = requests.get(f"{API_BASE}/schedule/status/{job_id}")
        print(f"Job status response: {response.status_code}")
        
        if response.status_code == 200:
            status = response.json()
            print(f"Job status: {json.dumps(status, indent=2, default=str)}")
            return status
        else:
            print(f"Error getting job status: {response.text}")
            return None
    except Exception as e:
        print(f"Job status test failed: {e}")
        return None

def main():
    print("Testing MedSchedulr Python API")
    print("=" * 40)
    
    # Test health check
    if not test_health_check():
        print("Health check failed - is the API server running?")
        return
    
    print("\n" + "=" * 40)
    
    # Test schedule generation
    job_id = test_schedule_generation()
    if not job_id:
        print("Schedule generation failed")
        return
    
    print(f"\nTesting job status for {job_id}")
    print("=" * 40)
    
    # Test job status
    status = test_job_status(job_id)
    print(f"Final status: {status.get('status') if status else 'Unknown'}")

if __name__ == "__main__":
    main()