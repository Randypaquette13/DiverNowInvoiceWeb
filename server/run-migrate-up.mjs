import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from project root (parent of server/) so DATABASE_URL is set
dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add it to .env in the project root.');
  process.exit(1);
}

// node-pg-migrate expects DATABASE_URL; run its CLI
const { execSync } = await import('child_process');
execSync('node node_modules/node-pg-migrate/bin/node-pg-migrate up', {
  stdio: 'inherit',
  cwd: __dirname,
  env: process.env,
});
