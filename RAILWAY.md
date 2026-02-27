# Deploy Diver Now Admin to Railway

## 1. Prerequisites

- [Railway](https://railway.app) account (and GitHub repo connected)
- This repo pushed to GitHub

## 2. Create project and Postgres

1. In Railway: **New Project** → **Deploy from GitHub repo** → select your repo.
2. Add Postgres: **+ New** → **Database** → **PostgreSQL**. Railway will set `DATABASE_URL` automatically when you add it to the same project.

## 3. Configure the service

In your **service** (the app, not the database):

### Build

- **Build Command:**  
  `npm install && cd client && npm install && npm run build && cd ../server && npm install`
- **Output Directory:** leave empty (build runs from repo root).
- **Root Directory:** leave empty (repo root).

### Start

- **Start Command:**  
  `cd server && npm run db:migrate:up && npm start`  

  (Runs migrations then starts the server. For a one-off migration instead, run in Railway’s shell: `cd server && npm run db:migrate:up`.)

### Variables

In **Variables** (or **Settings** → **Environment**), set:

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Usually added automatically when you add Postgres to the project. If not, copy from Postgres service. |
| `NODE_ENV` | Yes | Set to `production`. |
| `SESSION_SECRET` | Yes | Long random string (e.g. `openssl rand -hex 32`). |
| `ADMIN_SECRET` | Yes | Secret for creating users (e.g. curl to `/api/admin/users`). |
| `CLIENT_ORIGIN` | Yes | Your app’s public URL, e.g. `https://your-app.up.railway.app`. |
| `GOOGLE_CLIENT_ID` | If using Google Calendar | From Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | If using Google Calendar | From Google Cloud Console. |
| `GOOGLE_REDIRECT_URI` | If using Google Calendar | `https://your-app.up.railway.app/api/auth/google/callback`. |
| `SQUARE_ACCESS_TOKEN` | Optional | Default Square token (or set per user in app). |
| `SQUARE_LOCATION_ID` | Optional | Default Square location. |
| `SQUARE_ENVIRONMENT` | Optional | `sandbox` or production. |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_KEY_PATH` | Optional | For iOS push; only if you use push. |

After the first deploy, set **CLIENT_ORIGIN** (and **GOOGLE_REDIRECT_URI** if you use Google) to the URL Railway gives you (e.g. from **Settings** → **Networking** → **Generate Domain**).

## 4. Deploy

- Push to the connected branch; Railway will build and deploy.
- Or trigger a deploy from the Railway dashboard.

## 5. Post-deploy

1. **Create a user** (if you don’t have one):  
   `curl -X POST https://your-app.up.railway.app/api/admin/users -H "X-Admin-Secret: YOUR_ADMIN_SECRET" -H "Content-Type: application/json" -d '{"email":"you@example.com","password":"your-password","role":"user"}'`

2. **Google OAuth:** In [Google Cloud Console](https://console.cloud.google.com), add to the OAuth client’s redirect URIs:  
   `https://your-app.up.railway.app/api/auth/google/callback`

3. Open **CLIENT_ORIGIN** in the browser and log in.

## Troubleshooting

- **Build fails:** Ensure Build Command installs and builds the client and installs the server (see above). Check the build logs for missing deps or failed `vite build`.
- **502 / app not starting:** Check that Start Command runs from repo root and that `server/node_modules` exists (server install in build). Check logs for `DATABASE_URL` or migration errors.
- **Session / login broken:** Ensure `SESSION_SECRET` is set and `CLIENT_ORIGIN` matches the URL you use (no trailing slash). Use HTTPS in production.
- **Google login redirect:** `GOOGLE_REDIRECT_URI` must match exactly what’s in Google Console and use the same host as `CLIENT_ORIGIN`.
