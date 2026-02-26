import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from project root so DATABASE_URL is set when running migrations
dotenv.config({ path: path.join(__dirname, '..', '.env') });

execSync('node', [
  'node_modules/node-pg-migrate/bin/node-pg-migrate',
  ...process.argv.slice(2),
], {
  stdio: 'inherit',
  cwd: __dirname,
  env: process.env,
});
