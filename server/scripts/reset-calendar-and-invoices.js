/**
 * Reset: runs migrations, ensures required columns exist, then deletes all
 * calendar/invoice/cleaning data. Users, integrations, sessions, and push
 * tokens are left intact.
 *
 * When adding new migrations that add columns to reset tables, add an
 * "ADD COLUMN IF NOT EXISTS" (and index if any) in the ensure-schema block
 * below so this script works even if migrations were run against another DB.
 *
 * Tables cleared (keep in sync when adding new reset-worthy tables):
 *   - square_orders
 *   - squarespace_orders
 *   - event_invoice_mappings
 *   - cleaning_records
 *   - calendar_events
 *
 * Run from repo root: npm run db:reset-calendar-invoices
 * Or from server: node scripts/reset-calendar-and-invoices.js
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pool from '../db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure schema is up to date (e.g. recurring_series_id on event_invoice_mappings)
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
console.log('Applying pending migrations...');
execSync('node run-migrate.mjs', {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: process.env,
});

async function main() {
  const client = await pool.connect();
  try {
    // Ensure schema columns exist on the same DB we're about to clear (in case migrations ran elsewhere)
    await client.query(`
      ALTER TABLE event_invoice_mappings
      ADD COLUMN IF NOT EXISTS recurring_series_id varchar(255)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS event_invoice_mappings_user_recurring_series_idx
      ON event_invoice_mappings (user_id, recurring_series_id)
    `);

    console.log('Resetting calendar events, links, cleaning records, and stored invoices...');

    await client.query('DELETE FROM square_orders');
    console.log('  Deleted square_orders (Square stored invoices).');

    await client.query('DELETE FROM squarespace_orders');
    console.log('  Deleted squarespace_orders (Squarespace stored orders).');

    await client.query('DELETE FROM event_invoice_mappings');
    console.log('  Deleted event_invoice_mappings (event–invoice links).');

    await client.query('DELETE FROM cleaning_records');
    console.log('  Deleted cleaning_records.');

    await client.query('DELETE FROM calendar_events');
    console.log('  Deleted calendar_events.');

    console.log('Done. Users, integrations, sessions, and push tokens were not changed.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
