import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from project root so DATABASE_URL is set when running migrations
dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env in the project root.');
  process.exit(1);
}

const extra = process.argv.slice(2).join(' ');
const cmd = extra
  ? `node node_modules/node-pg-migrate/bin/node-pg-migrate ${extra}`
  : 'node node_modules/node-pg-migrate/bin/node-pg-migrate up';

execSync(cmd, {
  stdio: 'inherit',
  cwd: __dirname,
  env: process.env,
  shell: true,
});
