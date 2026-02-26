import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import pool from '../db/pool.js';

export const cleaningsRouter = Router();
cleaningsRouter.use(requireAuth);

cleaningsRouter.get('/', async (req, res) => {
  const userId = req.session.userId;
  const { rows } = await pool.query(
    `SELECT id, user_id, calendar_event_id, status, notes, extra_work, squarespace_order_id, square_order_id, created_at, updated_at
     FROM cleaning_records WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  res.json(rows.map((r) => ({ ...r, order_id: r.square_order_id || r.squarespace_order_id })));
});

cleaningsRouter.post('/', async (req, res) => {
  const userId = req.session.userId;
  const { calendar_event_id, status, notes, extra_work, squarespace_order_id, square_order_id, order_id } = req.body;
  if (!calendar_event_id || !status) {
    return res.status(400).json({ error: 'calendar_event_id and status required' });
  }
  const ordId = order_id ?? square_order_id ?? squarespace_order_id;
  const { rows } = await pool.query(
    `INSERT INTO cleaning_records (user_id, calendar_event_id, status, notes, extra_work, square_order_id, squarespace_order_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (calendar_event_id) DO UPDATE SET
       status = COALESCE(EXCLUDED.status, cleaning_records.status),
       notes = COALESCE(EXCLUDED.notes, cleaning_records.notes),
       extra_work = COALESCE(EXCLUDED.extra_work, cleaning_records.extra_work),
       square_order_id = COALESCE(EXCLUDED.square_order_id, cleaning_records.square_order_id),
       squarespace_order_id = COALESCE(EXCLUDED.squarespace_order_id, cleaning_records.squarespace_order_id),
       updated_at = NOW()
     RETURNING id, calendar_event_id, status, notes, extra_work, square_order_id, squarespace_order_id, updated_at`,
    [userId, calendar_event_id, status, notes || null, extra_work || null, ordId || null, null]
  );
  const r = rows[0];
  res.json({ ...r, order_id: r.square_order_id || r.squarespace_order_id });
});
