import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import pool from '../db/pool.js';

export const mappingsRouter = Router();
mappingsRouter.use(requireAuth);

mappingsRouter.get('/', async (req, res) => {
  const userId = req.session.userId;
  const { rows } = await pool.query(
    `SELECT id, user_id, calendar_event_id, squarespace_order_id, square_order_id, recurring_series_id, created_at
     FROM event_invoice_mappings WHERE user_id = $1`,
    [userId]
  );
  res.json(rows.map((r) => ({
    ...r,
    order_id: r.square_order_id || r.squarespace_order_id,
  })));
});

mappingsRouter.post('/', async (req, res) => {
  const userId = req.session.userId;
  const { calendar_event_id, squarespace_order_id, square_order_id, order_id } = req.body;
  const orderId = order_id ?? square_order_id ?? squarespace_order_id;
  if (!calendar_event_id || !orderId) {
    return res.status(400).json({ error: 'calendar_event_id and order_id (or square_order_id) required' });
  }
  let eventRow = await pool.query(
    `SELECT id, recurring_event_id, raw_json->>'recurringEventId' AS series_id_from_raw
     FROM calendar_events WHERE id = $1 AND user_id = $2`,
    [calendar_event_id, userId]
  );
  if (!eventRow.rows[0]) {
    return res.status(404).json({ error: 'Calendar event not found' });
  }
  // So sync auto-link can find this mapping: set recurring_event_id from raw_json if missing
  await pool.query(
    `UPDATE calendar_events SET recurring_event_id = raw_json->>'recurringEventId'
     WHERE id = $1 AND user_id = $2 AND (recurring_event_id IS NULL OR recurring_event_id = '') AND raw_json IS NOT NULL AND raw_json ? 'recurringEventId'`,
    [calendar_event_id, userId]
  );
  eventRow = await pool.query(
    `SELECT id, recurring_event_id, raw_json->>'recurringEventId' AS series_id_from_raw FROM calendar_events WHERE id = $1 AND user_id = $2`,
    [calendar_event_id, userId]
  );
  let recurringEventId = eventRow.rows[0].recurring_event_id;
  const seriesIdFromRaw = eventRow.rows[0].series_id_from_raw;
  const recurringSeriesId = recurringEventId || seriesIdFromRaw || null;
  let eventIdsToLink = [Number(calendar_event_id)];
  // Link to all other loaded instances of this recurring event (by column or raw_json)
  if (recurringSeriesId) {
    const sameSeries = await pool.query(
      `SELECT id FROM calendar_events
       WHERE user_id = $1 AND (recurring_event_id = $2 OR (raw_json IS NOT NULL AND raw_json->>'recurringEventId' = $2))`,
      [userId, recurringSeriesId]
    );
    eventIdsToLink = sameSeries.rows.map((r) => r.id);
  }
  for (const eid of eventIdsToLink) {
    await pool.query(
      `INSERT INTO event_invoice_mappings (user_id, calendar_event_id, square_order_id, recurring_series_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (calendar_event_id) DO UPDATE SET
         square_order_id = EXCLUDED.square_order_id,
         recurring_series_id = COALESCE(EXCLUDED.recurring_series_id, event_invoice_mappings.recurring_series_id)`,
      [userId, eid, orderId, recurringSeriesId]
    );
  }
  const { rows } = await pool.query(
    `SELECT id, calendar_event_id, square_order_id, squarespace_order_id
     FROM event_invoice_mappings WHERE user_id = $1 AND calendar_event_id = $2`,
    [userId, calendar_event_id]
  );
  const r = rows[0];
  res.json({ ...r, order_id: r.square_order_id || r.squarespace_order_id });
});

mappingsRouter.delete('/:id', async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.params;
  const { rows: mappingRows } = await pool.query(
    'SELECT calendar_event_id, recurring_series_id FROM event_invoice_mappings WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (!mappingRows[0]) {
    return res.status(404).json({ error: 'Mapping not found' });
  }
  const { calendar_event_id: calendarEventId, recurring_series_id: recurringSeriesId } = mappingRows[0];
  if (recurringSeriesId) {
    await pool.query(
      'DELETE FROM event_invoice_mappings WHERE user_id = $1 AND recurring_series_id = $2',
      [userId, recurringSeriesId]
    );
  } else {
    // Same recurring event may have been linked before recurring_series_id existed; find by calendar event series
    const { rows: eventRows } = await pool.query(
      `SELECT recurring_event_id, raw_json->>'recurringEventId' AS series_id_from_raw
       FROM calendar_events WHERE id = $1 AND user_id = $2`,
      [calendarEventId, userId]
    );
    const seriesId = eventRows[0]?.recurring_event_id || eventRows[0]?.series_id_from_raw || null;
    if (seriesId) {
      const { rows: sameSeriesEvents } = await pool.query(
        `SELECT id FROM calendar_events
         WHERE user_id = $1 AND (recurring_event_id = $2 OR (raw_json IS NOT NULL AND raw_json->>'recurringEventId' = $2))`,
        [userId, seriesId]
      );
      const eventIds = sameSeriesEvents.map((r) => r.id);
      if (eventIds.length > 0) {
        await pool.query(
          'DELETE FROM event_invoice_mappings WHERE user_id = $1 AND calendar_event_id = ANY($2)',
          [userId, eventIds]
        );
      } else {
        await pool.query(
          'DELETE FROM event_invoice_mappings WHERE id = $1 AND user_id = $2',
          [id, userId]
        );
      }
    } else {
      await pool.query(
        'DELETE FROM event_invoice_mappings WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
    }
  }
  res.status(204).send();
});
