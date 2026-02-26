import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
let poolConfig = {
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

if (connectionString) {
  try {
    const url = new URL(connectionString);
    // Ensure password is always a string (pg SCRAM auth requires it)
    const password = url.password != null ? String(decodeURIComponent(url.password)) : '';
    poolConfig = {
      ...poolConfig,
      host: url.hostname,
      port: url.port || 5432,
      user: url.username || undefined,
      password,
      database: url.pathname.slice(1) || undefined,
    };
  } catch {
    poolConfig.connectionString = connectionString;
  }
} else {
  poolConfig.connectionString = connectionString;
}

const pool = new Pool(poolConfig);

export default pool;
