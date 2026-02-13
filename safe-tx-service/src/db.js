import fs from 'node:fs/promises';
import { Pool } from 'pg';
import { config } from './config.js';

export const pool = new Pool({ connectionString: config.databaseUrl });

export async function initDb() {
  const sql = await fs.readFile(new URL('../sql/init.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}
