import { Router } from 'express';
import bcrypt from 'bcrypt';
import { google } from 'googleapis';
import pool from '../db/pool.js';

export const authRouter = Router();
const oauth2Client = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const { rows } = await pool.query(
    'SELECT id, email, password_hash, role FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  req.session.userId = user.id;
  req.session.userEmail = user.email;
  req.session.userRole = user.role;
  res.json({ id: user.id, email: user.email, role: user.role });
});

authRouter.get('/google', (req, res) => {
  if (!req.session.userId) {
    return res.redirect(process.env.CLIENT_ORIGIN || 'http://localhost:5173');
  }
  const auth = oauth2Client();
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'],
    state: String(req.session.userId),
  });
  res.redirect(url);
});

authRouter.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const userId = state ? parseInt(state, 10) : req.session?.userId;
  if (!code || !userId) {
    return res.redirect((process.env.CLIENT_ORIGIN || 'http://localhost:5173') + '?google=error');
  }
  const auth = oauth2Client();
  const { tokens } = await auth.getToken(code);
  const { rows } = await pool.query('SELECT id FROM user_integrations WHERE user_id = $1', [userId]);
  if (rows.length > 0) {
    await pool.query(
      'UPDATE user_integrations SET google_refresh_token = $2, updated_at = NOW() WHERE user_id = $1',
      [userId, tokens.refresh_token]
    );
  } else {
    await pool.query(
      'INSERT INTO user_integrations (user_id, google_refresh_token) VALUES ($1, $2)',
      [userId, tokens.refresh_token]
    );
  }
  res.redirect(process.env.CLIENT_ORIGIN || 'http://localhost:5173');
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});
