import { initDb, pool } from './db.js';

await initDb();
console.log('Database initialized.');
await pool.end();
