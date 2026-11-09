# CLOSER User Dashboard — Vercel runtime

The production deploy preserves the integrated single-page UI and uses Node.js serverless handlers under `src/api`.

## Required Vercel environment variables
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (browser-safe publishable key; never put service_role here)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Add all server variables to Production, Preview, and Development. Never commit secrets to GitHub.

## Health
`GET /api/health` exposes readiness booleans only and never returns credentials.

## Upload security
The signature route validates the Supabase access token against Auth, accepts only post/story/avatar/cover targets, pins the authenticated user's Cloudinary folder, and signs the upload timestamp/folder without exposing the API secret.

## Source sync
GitHub is the canonical source for future Vercel deployments.
