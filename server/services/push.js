import pool from '../db/pool.js';

let apnProvider = null;
let apnModule = null;

async function getProvider() {
  if (apnProvider) return apnProvider;
  const keyPath = process.env.APNS_KEY_PATH;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!keyPath || !keyId || !teamId) {
    console.warn('APNs not configured; push notifications disabled');
    return null;
  }
  try {
    apnModule = await import('apn');
    const options = {
      token: {
        key: keyPath,
        keyId,
        teamId,
      },
      production: process.env.NODE_ENV === 'production',
    };
    const Apn = apnModule.default || apnModule;
    apnProvider = new Apn.Provider(options);
    return apnProvider;
  } catch (err) {
    console.warn('APNs init failed:', err.message);
    return null;
  }
}

export async function sendDailyPushToUser(userId, count) {
  const provider = await getProvider();
  if (!provider || !apnModule) return;
  const { rows: tokens } = await pool.query(
    'SELECT device_token FROM push_tokens WHERE user_id = $1',
    [userId]
  );
  if (tokens.length === 0) return;
  const Apn = apnModule.default || apnModule;
  const notification = new Apn.Notification();
  notification.alert = count === 1
    ? 'You had 1 boat cleaned today.'
    : `You had ${count} boats cleaned today.`;
  notification.topic = process.env.APNS_BUNDLE_ID;
  notification.pushType = 'alert';
  const deviceTokens = tokens.map((t) => t.device_token);
  try {
    await provider.send(notification, deviceTokens);
  } catch (e) {
    console.warn('Push send failed:', e.message);
  }
}

export async function runDailySummary() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const { rows } = await pool.query(
    `SELECT user_id, COUNT(*) AS cnt FROM cleaning_records
     WHERE status = 'yes' AND created_at >= $1 AND created_at < $2
     GROUP BY user_id`,
    [today, tomorrow]
  );
  for (const { user_id, cnt } of rows) {
    await sendDailyPushToUser(user_id, parseInt(cnt, 10));
  }
}
