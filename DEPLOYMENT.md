# Vercel Deployment Notes

## Frontend (React + Vite)
Deploy via Vercel dashboard:
- **Root Directory**: `frontend`
- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variable**: `VITE_API_URL` → your backend URL

See `frontend/vercel.json` for full config.

## Backend (FastAPI)
Deploy separately (Railway, Render, or Docker on a VPS).
