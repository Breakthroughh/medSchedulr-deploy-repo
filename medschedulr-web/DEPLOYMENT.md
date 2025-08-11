# MedSchedulr Deployment Guide

## Overview
This guide walks through deploying MedSchedulr to production using Vercel (frontend) + Supabase (database) + Railway (Python API).

## Prerequisites
- Vercel account
- Supabase account
- Railway account (or alternative for Python API)
- GitHub repository

## 1. Database Setup (Supabase)

### Create Supabase Project
1. Go to https://supabase.com
2. Create new project
3. Note down the database URL from Settings → Database

### Set up Database
```bash
# Update DATABASE_URL in .env to use Supabase PostgreSQL URL
DATABASE_URL="postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres"

# Run migrations
npx prisma migrate dev
npx prisma db push
```

## 2. Frontend Deployment (Vercel)

### Prepare Repository
1. Commit all changes to Git
2. Push to GitHub
3. Connect repository to Vercel

### Environment Variables (Vercel Dashboard)
Set these environment variables in Vercel:
```
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
NEXTAUTH_SECRET=your-random-secret-here
NEXTAUTH_URL=https://your-app.vercel.app
PYTHON_API_URL=https://your-python-api.railway.app
NODE_ENV=production
```

### Build Settings
- Framework: Next.js
- Build Command: `npm run build`
- Install Command: `npm install`

## 3. Python API Deployment (Railway)

### Create Railway Service
1. Go to https://railway.app
2. Create new project from GitHub repo
3. Select the `medschedulr-python-api` folder

### Environment Variables (Railway)
```
PORT=8000
PYTHON_VERSION=3.11
```

### Railway Configuration
Create `railway.toml` in python API folder:
```toml
[build]
builder = "NIXPACKS"

[deploy]
healthcheckPath = "/health"
restartPolicyType = "ON_FAILURE"
```

## 4. Post-Deployment Setup

### Database Initialization
```bash
# Run seed script to create initial data
npm run seed
```

### Test Endpoints
- Frontend: https://your-app.vercel.app
- API Health: https://your-python-api.railway.app/health
- Admin Login: admin@hospital.com / admin123

## 5. Domain Setup (Optional)
1. Configure custom domain in Vercel
2. Update NEXTAUTH_URL environment variable
3. Update any hardcoded URLs

## Troubleshooting

### Common Issues
1. **Database Connection**: Verify DATABASE_URL format and credentials
2. **CORS Issues**: Ensure Python API allows requests from Vercel domain
3. **Environment Variables**: Double-check all required env vars are set
4. **Build Failures**: Check for TypeScript errors and missing dependencies

### Logs
- Vercel: View in Vercel dashboard → Functions tab
- Railway: View in Railway dashboard → Deployments
- Supabase: Database logs in Supabase dashboard