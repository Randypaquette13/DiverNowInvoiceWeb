import { Router } from 'express';
import pool from '../db/pool.js';

export const pushRouter = Router();

pushRouter.post('/register', async (req, res) => {
  const { deviceToken, platform = 'ios', email } = req.body;
  if (!deviceToken || !email) {
    return res.status(400).json({ error: 'deviceToken and email required' });
  }
  const { rows: users } = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  const user = users[0];
  if (!user) {
    return res.status(404).json({ error: 'User not found for this email' });
  }
  await pool.query(
    `INSERT INTO push_tokens (user_id, device_token, platform)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [user.id, deviceToken, platform]
  );
  const { rows: tokens } = await pool.query(
    'SELECT id FROM push_tokens WHERE user_id = $1 AND device_token = $2',
    [user.id, deviceToken]
  );
  if (tokens.length === 0) {
    await pool.query(
      'INSERT INTO push_tokens (user_id, device_token, platform) VALUES ($1, $2, $3)',
      [user.id, deviceToken, platform]
    );
  }
  res.status(201).json({ ok: true });
});
