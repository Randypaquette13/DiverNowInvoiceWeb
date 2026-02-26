import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import pool from '../db/pool.js';

export const integrationsRouter = Router();
integrationsRouter.use(requireAuth);

integrationsRouter.get('/', async (req, res) => {
  const userId = req.session.userId;
  const { rows } = await pool.query(
    `SELECT id, google_calendar_id, squarespace_site_id, square_location_id,
            (google_refresh_token IS NOT NULL) AS google_connected,
            (squarespace_api_key IS NOT NULL AND squarespace_api_key != '') AS squarespace_connected,
            (square_access_token IS NOT NULL AND square_access_token != '') AS square_connected
     FROM user_integrations WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  res.json(rows[0] || { google_connected: false, squarespace_connected: false, square_connected: false });
});

integrationsRouter.patch('/', async (req, res) => {
  const userId = req.session.userId;
  const { squarespace_api_key, squarespace_site_id, google_calendar_id, square_access_token, square_location_id } = req.body;
  const { rows } = await pool.query('SELECT id FROM user_integrations WHERE user_id = $1', [userId]);
  const apiKey = squarespace_api_key !== undefined ? (squarespace_api_key || null) : undefined;
  const siteId = squarespace_site_id !== undefined ? (squarespace_site_id || null) : undefined;
  const calendarId = google_calendar_id !== undefined ? (google_calendar_id || null) : undefined;
  const squareToken = square_access_token !== undefined ? (square_access_token || null) : undefined;
  const squareLoc = square_location_id !== undefined ? (square_location_id || null) : undefined;

  if (rows.length > 0) {
    const updates = [];
    const params = [userId];
    let n = 2;
    if (apiKey !== undefined) {
      updates.push(`squarespace_api_key = COALESCE($${n}, squarespace_api_key)`);
      params.push(apiKey);
      n += 1;
    }
    if (siteId !== undefined) {
      updates.push(`squarespace_site_id = $${n}`);
      params.push(siteId);
      n += 1;
    }
    if (calendarId !== undefined) {
      updates.push(`google_calendar_id = $${n}`);
      params.push(calendarId);
      n += 1;
    }
    if (squareToken !== undefined) {
      updates.push(`square_access_token = COALESCE($${n}, square_access_token)`);
      params.push(squareToken);
      n += 1;
    }
    if (squareLoc !== undefined) {
      updates.push(`square_location_id = $${n}`);
      params.push(squareLoc);
      n += 1;
    }
    if (updates.length === 0) {
      return res.json({ ok: true });
    }
    updates.push('updated_at = NOW()');
    await pool.query(
      `UPDATE user_integrations SET ${updates.join(', ')} WHERE user_id = $1`,
      params
    );
  } else {
    await pool.query(
      `INSERT INTO user_integrations (user_id, squarespace_api_key, squarespace_site_id, google_calendar_id, square_access_token, square_location_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, apiKey ?? null, siteId ?? null, calendarId ?? null, squareToken ?? null, squareLoc ?? null]
    );
  }
  res.json({ ok: true });
});
