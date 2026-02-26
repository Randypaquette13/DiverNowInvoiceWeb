import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import pool from '../db/pool.js';

export const mappingsRouter = Router();
mappingsRouter.use(requireAuth);

mappingsRouter.get('/', async (req, res) => {
  const userId = req.session.userId;
  const { rows } = await pool.query(
    `SELECT id, user_id, calendar_event_id, squarespace_order_id, square_order_id, created_at
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
  const { rows } = await pool.query(
    `INSERT INTO event_invoice_mappings (user_id, calendar_event_id, square_order_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (calendar_event_id) DO UPDATE SET square_order_id = EXCLUDED.square_order_id
     RETURNING id, calendar_event_id, square_order_id, squarespace_order_id`,
    [userId, calendar_event_id, orderId]
  );
  const r = rows[0];
  res.json({ ...r, order_id: r.square_order_id || r.squarespace_order_id });
});

mappingsRouter.delete('/:id', async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.params;
  await pool.query(
    'DELETE FROM event_invoice_mappings WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  res.status(204).send();
});
