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

calendarRouter.get('/list', async (req, res) => {
  const userId = req.session.userId;
  const auth = await getOAuth2Client(userId);
  if (!auth) {
    return res.json([]);
  }
  try {
    const calendar = google.calendar({ version: 'v3', auth: auth.client });
    const { data } = await calendar.calendarList.list({});
    const items = (data.items || []).map((cal) => ({
      id: cal.id,
      summary: cal.summary || cal.id || 'Unnamed',
      primary: cal.primary === true,
    }));
    res.json(items);
  } catch (err) {
    if (isInvalidGrant(err)) {
      await pool.query(
        'UPDATE user_integrations SET google_refresh_token = NULL, updated_at = NOW() WHERE user_id = $1',
        [userId]
      );
      return res.status(401).json({
        error: 'Google Calendar access expired or was revoked.',
        code: 'google_reconnect',
      });
    }
    throw err;
  }
});

// Parse YYYY-MM-DD as start of day (UTC). For "to", use end of that day so the full day is included.
function parseFromDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
function parseToDate(str) {
  if (!str) return null;
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  // End of selected day (inclusive): 23:59:59.999 UTC
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

calendarRouter.get('/events', async (req, res) => {
  const userId = req.session.userId;
  const { from, to, fromDate: fromDateParam, toDateEnd } = req.query;
  let fromDate;
  let toDate;
  if (fromDateParam && toDateEnd) {
    const fd = new Date(fromDateParam);
    const td = new Date(toDateEnd);
    fromDate = isNaN(fd.getTime()) ? null : fd;
    toDate = isNaN(td.getTime()) ? null : td;
  }
  if (!fromDate) fromDate = parseFromDate(from) ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (!toDate) toDate = parseToDate(to) ?? new Date();
  const { rows: integRows } = await pool.query(
    'SELECT google_calendar_id FROM user_integrations WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  const selectedCalendarId = integRows[0]?.google_calendar_id || 'primary';
  const { rows } = await pool.query(
    `SELECT id, user_id, external_id, title, start_at, end_at, synced_at
     FROM calendar_events
     WHERE user_id = $1 AND start_at >= $2 AND start_at <= $3
       AND (source_calendar_id = $4 OR (source_calendar_id IS NULL AND $4 = 'primary'))
     ORDER BY start_at ASC`,
    [userId, fromDate, toDate, selectedCalendarId]
  );
  res.json(rows);
});

function isInvalidGrant(err) {
  const code = err?.response?.data?.error || err?.code;
  const desc = err?.response?.data?.error_description || err?.message || '';
  return code === 'invalid_grant' || /token has been expired or revoked/i.test(desc);
}

calendarRouter.post('/sync', async (req, res) => {
  const userId = req.session.userId;
  const auth = await getOAuth2Client(userId);
  if (!auth) {
    return res.status(400).json({ error: 'Google Calendar not connected. Connect in settings.' });
  }
  const calendar = google.calendar({ version: 'v3', auth: auth.client });
  let timeMin;
  let timeMax;
  const { from, to, fromDate: fromDateParam, toDateEnd } = req.body || {};
  if (fromDateParam && toDateEnd) {
    const fd = new Date(fromDateParam);
    const td = new Date(toDateEnd);
    timeMin = isNaN(fd.getTime()) ? undefined : fd.toISOString();
    timeMax = isNaN(td.getTime()) ? undefined : td.toISOString();
  }
  if (!timeMin || !timeMax) {
    if (from && to) {
      const fromDate = parseFromDate(from) ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const toDate = parseToDate(to) ?? new Date();
      timeMin = fromDate.toISOString();
      timeMax = toDate.toISOString();
    } else {
    timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
  }
  try {
    // So the recurring-event lookup can find mappings: ensure recurring_event_id is set from raw_json where missing
    await pool.query(
      `UPDATE calendar_events SET recurring_event_id = raw_json->>'recurringEventId'
       WHERE user_id = $1 AND raw_json IS NOT NULL AND raw_json ? 'recurringEventId'
         AND (recurring_event_id IS NULL OR recurring_event_id = '')`,
      [userId]
    );
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
      const recurringEventId = ev.recurringEventId || null;
      const { rows: upsertRows } = await pool.query(
      `INSERT INTO calendar_events (user_id, external_id, title, start_at, end_at, raw_json, recurring_event_id, source_calendar_id, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id, external_id) DO UPDATE SET
         title = EXCLUDED.title, start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at,
         raw_json = EXCLUDED.raw_json, recurring_event_id = EXCLUDED.recurring_event_id, source_calendar_id = EXCLUDED.source_calendar_id, synced_at = NOW()
       RETURNING id`,
        [userId, ev.id, ev.summary || ev.title || '', new Date(start), end ? new Date(end) : null, JSON.stringify(ev), recurringEventId, auth.calendarId]
      );
      const calendarEventId = upsertRows[0]?.id;
      if (calendarEventId && recurringEventId) {
        // Find any existing mapping for this recurring series (same recurring_event_id, any instance)
        const { rows: existingMapping } = await pool.query(
          `SELECT m.square_order_id, m.squarespace_order_id
           FROM event_invoice_mappings m
           WHERE m.user_id = $1
             AND (m.recurring_series_id = $2
                  OR EXISTS (
                    SELECT 1 FROM calendar_events ce
                    WHERE ce.id = m.calendar_event_id AND ce.user_id = $1
                      AND (ce.recurring_event_id = $2 OR (ce.raw_json IS NOT NULL AND ce.raw_json->>'recurringEventId' = $2))
                  ))
             AND (m.square_order_id IS NOT NULL OR m.squarespace_order_id IS NOT NULL)
           LIMIT 1`,
          [userId, recurringEventId]
        );
        if (existingMapping.length > 0) {
          const row = existingMapping[0];
          await pool.query(
            `INSERT INTO event_invoice_mappings (user_id, calendar_event_id, square_order_id, squarespace_order_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (calendar_event_id) DO UPDATE SET
               square_order_id = COALESCE(EXCLUDED.square_order_id, event_invoice_mappings.square_order_id),
               squarespace_order_id = COALESCE(EXCLUDED.squarespace_order_id, event_invoice_mappings.squarespace_order_id)`,
            [userId, calendarEventId, row.square_order_id ?? null, row.squarespace_order_id ?? null]
          );
        }
      }
    }
    res.json({ synced: events.length });
  } catch (err) {
    if (isInvalidGrant(err)) {
      await pool.query(
        'UPDATE user_integrations SET google_refresh_token = NULL, updated_at = NOW() WHERE user_id = $1',
        [userId]
      );
      return res.status(401).json({
        error: 'Google Calendar access expired or was revoked.',
        code: 'google_reconnect',
        detail: 'Please connect Google Calendar again from the dashboard.',
      });
    }
    throw err;
  }
});
