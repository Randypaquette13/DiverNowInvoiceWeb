import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cron from 'node-cron';
import pool from './db/pool.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { meRouter } from './routes/me.js';
import { calendarRouter } from './routes/calendar.js';
import { cleaningsRouter } from './routes/cleanings.js';
import { mappingsRouter } from './routes/mappings.js';
import { squarespaceRouter } from './routes/squarespace.js';
import { squareRouter } from './routes/square.js';
import { analyticsRouter } from './routes/analytics.js';
import { pushRouter } from './routes/push.js';
import { integrationsRouter } from './routes/integrations.js';
import { runDailySummary } from './services/push.js';

const pgSession = connectPgSimple(session);
const app = express();

// Required behind Railway/Heroku etc. so req.secure and req.protocol are correct
app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
}));

app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/admin', adminRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/cleanings', cleaningsRouter);
app.use('/api/mappings', mappingsRouter);
app.use('/api/squarespace', squarespaceRouter);
app.use('/api/square', squareRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/push', pushRouter);
app.use('/api/integrations', integrationsRouter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

const cronSchedule = process.env.DAILY_PUSH_CRON || '0 20 * * *';
try {
  cron.schedule(cronSchedule, () => {
    runDailySummary().catch((err) => console.error('Daily push failed:', err));
  });
  console.log('Daily push cron scheduled:', cronSchedule);
} catch (e) {
  console.warn('Cron schedule invalid, daily push disabled:', e.message);
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
