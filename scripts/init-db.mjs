import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';

const client = new pg.Client({
   connectionString: process.env.DATABASE_URL,
   ssl: process.env.DB_SSL == 'true' ? { rejectUnauthorized: false } : false,
});

await client.connect();
await client.query(fs.readFileSync('db/schema.sql', 'utf8'));

const { rows } = await client.query('SELECT count(*) FROM passes');
console.log(`Database initialized. Passes count: ${rows[0].count}`);

await client.end();