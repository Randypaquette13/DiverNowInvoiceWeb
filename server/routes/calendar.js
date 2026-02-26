import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import pool from '../db/pool.js';
import { google } from 'googleapis';

export const calendarRouter = Router();
calendarRouter.use(requireAuth);

async function getOAuth2Client(userId) {
  const { rows } = await pool.query(
    'SELECT google_refresh_token, google_calendar_id FROM user_integrations WHERE user_id = $1',
    [userId]
  );
  const row = rows[0];
  if (!row?.google_refresh_token) return null;
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: row.google_refresh_token });
  return { client: oauth2Client, calendarId: row.google_calendar_id || 'primary' };
}

calendarRouter.get('/events', async (req, res) => {
  const userId = req.session.userId;
  const { from, to } = req.query;
  const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const toDate = to ? new Date(to) : new Date();
  const { rows } = await pool.query(
    `SELECT id, user_id, external_id, title, start_at, end_at, synced_at
     FROM calendar_events
     WHERE user_id = $1 AND start_at >= $2 AND start_at <= $3
     ORDER BY start_at ASC`,
    [userId, fromDate, toDate]
  );
  res.json(rows);
});

calendarRouter.post('/sync', async (req, res) => {
  const userId = req.session.userId;
  const auth = await getOAuth2Client(userId);
  if (!auth) {
    return res.status(400).json({ error: 'Google Calendar not connected. Connect in settings.' });
  }
  const calendar = google.calendar({ version: 'v3', auth: auth.client });
  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await calendar.events.list({
    calendarId: auth.calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });
  const events = data.items || [];
  for (const ev of events) {
    const start = ev.start?.dateTime || ev.start?.date;
    const end = ev.end?.dateTime || ev.end?.date;
    if (!start) continue;
    await pool.query(
    `INSERT INTO calendar_events (user_id, external_id, title, start_at, end_at, raw_json, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, external_id) DO UPDATE SET
       title = EXCLUDED.title, start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at,
       raw_json = EXCLUDED.raw_json, synced_at = NOW()`,
      [userId, ev.id, ev.summary || ev.title || '', new Date(start), end ? new Date(end) : null, JSON.stringify(ev)]
    );
  }
  res.json({ synced: events.length });
});
