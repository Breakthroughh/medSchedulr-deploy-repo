#!/bin/bash

# Create critical on-call posts via API
echo "🏗️ Creating on-call posts via API..."

# Wait for server to start
sleep 5

# Create On-Call post
curl -X POST http://localhost:3000/api/admin/posts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "On-Call",
    "type": "BOTH"
  }' && echo "✅ Created On-Call post"

# Create Standby Oncall post
curl -X POST http://localhost:3000/api/admin/posts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Standby Oncall", 
    "type": "WEEKEND"
  }' && echo "✅ Created Standby Oncall post"

# Create Weekend Shift post
curl -X POST http://localhost:3000/api/admin/posts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekend Shift",
    "type": "WEEKEND"
  }' && echo "✅ Created Weekend Shift post"

echo "🎉 Done creating on-call posts"