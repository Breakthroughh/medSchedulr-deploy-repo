# MedSchedulr Deployment Guide

## Architecture Overview
- **Frontend**: Next.js 15 (Vercel)
- **Database**: PostgreSQL (Supabase)
- **Backend API**: Python FastAPI (Railway)

## Step 1: Supabase Database Setup

1. **Create Supabase Project**:
   - Go to [supabase.com](https://supabase.com) and create account
   - Click "New Project"
   - Choose organization, enter project name: `medschedulr-db`
   - Generate a strong database password (Brownie$07)
   - Select region (closest to your users)
   - Click "Create new project" (takes 2-3 minutes)

2. **Get Database URL**:
   - In your project dashboard, go to Settings → Database
   - Copy the "Connection string" under "Connection pooling"
   - Format: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`

3. **Run Database Migration**:
   ```bash
   # Set the DATABASE_URL environment variable
   export DATABASE_URL="your_supabase_connection_string_here"
   
   # Run migration
   npx prisma migrate deploy
   
   # Generate Prisma client
   npx prisma generate
   
   # Seed initial data
   npm run db:seed
   ```

## Step 2: Railway API Deployment

1. **Create Railway Account**:
   - Go to [railway.app](https://railway.app) and sign up
   - Connect your GitHub account

2. **Deploy Python API**:
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository and navigate to `/medschedulr-python-api`
   - Railway will auto-detect Python and use the `railway.toml` config
   - Set environment variables if needed
   - Deploy will start automatically

3. **Get API URL**:
   - After deployment, Railway provides a public URL like: `https://your-app.railway.app`
   - Note this URL for the Vercel deployment

## Step 3: Vercel Frontend Deployment

1. **Create Vercel Account**:
   - Go to [vercel.com](https://vercel.com) and sign up
   - Connect your GitHub account

2. **Deploy Next.js App**:
   - Click "New Project" 
   - Import your GitHub repository
   - Select the `/medschedulr-web` directory as root
   - Vercel auto-detects Next.js settings

3. **Configure Environment Variables**:
   ```
   DATABASE_URL=your_supabase_connection_string
   NEXTAUTH_SECRET=generate_random_32_char_string
   NEXTAUTH_URL=https://your-vercel-app.vercel.app
   PYTHON_API_BASE_URL=https://your-railway-api.railway.app
   NODE_ENV=production
   ```

4. **Deploy**:
   - Click "Deploy"
   - Vercel will build and deploy automatically

## Step 4: Final Configuration

1. **Update API CORS** (if needed):
   - In Railway, add your Vercel domain to CORS origins
   - Or keep wildcard `*` for testing

2. **Test Endpoints**:
   - Frontend: `https://your-app.vercel.app`
   - API Health: `https://your-api.railway.app/health`
   - Database: Via Prisma Studio or Supabase dashboard

## Environment Variables Summary

### Vercel (Frontend)
```
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=https://your-app.vercel.app  
PYTHON_API_BASE_URL=https://your-api.railway.app
NODE_ENV=production
```

### Railway (Python API)
```
PORT=8000 (auto-set by Railway)
```

## Troubleshooting

### Database Connection Issues
- Verify DATABASE_URL format
- Check Supabase project status
- Ensure connection pooling is enabled

### Build Failures
- Check build logs in Vercel/Railway
- Verify all dependencies in package.json/requirements.txt
- Ensure Prisma schema matches database

### CORS Errors
- Verify CORS settings in Python API
- Check frontend is using correct API URL

## Next Steps After Deployment
1. Test user registration and authentication
2. Create test doctors, units, and roster periods
3. Generate a test schedule
4. Verify all functionality works end-to-end