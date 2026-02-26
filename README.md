# Diver Now Admin

Admin tool for Diver Now boat hull cleaning: Google Calendar sync, Squarespace orders/invoices, cleaning records, analytics, and daily iOS push notifications.

## Stack

- **Client**: React (Vite), React Router, TanStack Query, Recharts, Tailwind
- **Server**: Node.js, Express, PostgreSQL (session store + app data), node-cron for daily push
- **Auth**: Session (express-session + connect-pg-simple), curl-create-user via `ADMIN_SECRET`

## Setup

1. **Clone and install**
   ```bash
   cd DiverNowAdmin
   npm install
   cd server && npm install && cd ..
   cd client && npm install && cd ..
   ```

2. **Database**
   - Create a PostgreSQL database and set `DATABASE_URL` in `.env`.
   - Run migrations:
     ```bash
     cd server && npm run db:migrate:up
     ```

3. **Environment**
   - Copy `.env.example` to `.env` and set at least:
     - `DATABASE_URL`
     - `SESSION_SECRET`
     - `ADMIN_SECRET` (for creating users via curl)
   - Optional: Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`), Squarespace API key, APNs keys, `DAILY_PUSH_CRON`.

4. **Create first user (curl)**
   ```bash
   curl -X POST http://localhost:5000/api/admin/users \
     -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
     -H "Content-Type: application/json" \
     -d "{\"email\":\"admin@example.com\",\"password\":\"yourpassword\",\"role\":\"user\"}"
   ```

5. **Run**
   - Dev (API + client with proxy):
     ```bash
     npm run dev
     ```
   - Or run server and client separately:
     ```bash
     npm run dev:server   # port 5000
     npm run dev:client   # port 5173
     ```
   - Production: `npm run build` then `npm start` (serves client from `client/dist`).

## Deploy (Railway)

- Add PostgreSQL plugin; set `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_SECRET`, and other env vars.
- Set `NODE_ENV=production`. Build command: `npm run build`. Start: `npm start`.
- Daily push runs in-process via `node-cron`; schedule is `DAILY_PUSH_CRON` (e.g. `0 20 * * *`).

## API (high level)

- `POST /api/auth/login` – login (email, password)
- `POST /api/auth/logout` – logout
- `GET /api/me` – current user (requires session)
- `POST /api/admin/users` – create user (header `X-Admin-Secret`)
- `GET /api/calendar/events`, `POST /api/calendar/sync` – events and Google sync
- `GET/POST /api/cleanings` – cleaning records
- `GET/POST/DELETE /api/mappings` – event–invoice mappings
- `GET /api/squarespace/orders`, `POST /api/squarespace/sync`, `POST /api/squarespace/orders/create` – Squarespace
- `GET /api/analytics/summary`, `GET /api/analytics/customers` – analytics
- `POST /api/push/register` – register device token (body: `deviceToken`, `email`, `platform`)
