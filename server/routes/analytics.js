import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import pool from '../db/pool.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

analyticsRouter.get('/summary', async (req, res) => {
  const userId = req.session.userId;
  const { from, to } = req.query;
  const fromDate = from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);
  const { rows: sum } = await pool.query(
    `SELECT COUNT(cr.id) AS total_cleanings,
            COALESCE(SUM(CAST(NULLIF(COALESCE(sq.amount, so.amount), '') AS NUMERIC)), 0) AS total_revenue
     FROM cleaning_records cr
     LEFT JOIN event_invoice_mappings m ON m.calendar_event_id = cr.calendar_event_id AND m.user_id = cr.user_id
     LEFT JOIN square_orders sq ON sq.external_order_id = m.square_order_id AND sq.user_id = cr.user_id
     LEFT JOIN squarespace_orders so ON so.external_order_id = m.squarespace_order_id AND so.user_id = cr.user_id
     WHERE cr.user_id = $1 AND cr.status = 'yes' AND cr.created_at >= $2::date AND cr.created_at <= $3::date`,
    [userId, fromDate, toDate]
  );
  const { rows: uniq } = await pool.query(
    `SELECT COUNT(DISTINCT ce.title) AS unique_customers
     FROM cleaning_records cr
     JOIN calendar_events ce ON ce.id = cr.calendar_event_id AND ce.user_id = cr.user_id
     WHERE cr.user_id = $1 AND cr.status = 'yes' AND cr.created_at >= $2::date AND cr.created_at <= $3::date`,
    [userId, fromDate, toDate]
  );
  res.json({
    totalCleanings: parseInt(sum[0]?.total_cleanings || 0, 10),
    totalRevenue: parseFloat(sum[0]?.total_revenue || 0),
    uniqueCustomers: parseInt(uniq[0]?.unique_customers || 0, 10),
  });
});

analyticsRouter.get('/customers', async (req, res) => {
  const userId = req.session.userId;
  const { from, to } = req.query;
  const fromDate = from || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT ce.title AS customer, COUNT(cr.id) AS cleanings, COALESCE(SUM(CAST(NULLIF(COALESCE(sq.amount, so.amount), '') AS NUMERIC)), 0) AS revenue
     FROM calendar_events ce
     JOIN cleaning_records cr ON cr.calendar_event_id = ce.id AND cr.user_id = ce.user_id AND cr.status = 'yes'
     LEFT JOIN event_invoice_mappings m ON m.calendar_event_id = ce.id AND m.user_id = ce.user_id
     LEFT JOIN square_orders sq ON sq.external_order_id = m.square_order_id AND sq.user_id = ce.user_id
     LEFT JOIN squarespace_orders so ON so.external_order_id = m.squarespace_order_id AND so.user_id = ce.user_id
     WHERE ce.user_id = $1 AND cr.created_at >= $2::date AND cr.created_at <= $3::date
     GROUP BY ce.title`,
    [userId, fromDate, toDate]
  );
  res.json(rows.map((r) => ({ customer: r.customer || 'Untitled', cleanings: parseInt(r.cleanings, 10), revenue: parseFloat(r.revenue || 0) })));
});
