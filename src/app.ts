import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import  { pool } from './db.ts';

const app = express();
app.set('view engine', 'pug');
app.set('views', path.join(import.meta.dirname, 'views'));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.get('/', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status = 'ACTIVE')::int AS active
    FROM passes
  `);
  res.render('index', { total: rows[0].total, active: rows[0].active });
});

app.get('/info/:id', async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    return res.status(404).render('notfound');
  }

  const { rows } = await pool.query(
    'SELECT name, document, issued_at, status FROM passes WHERE id = $1',
    [id]
  );
  if (rows.length === 0) {
    return res.status(404).render('notfound');
  }

  res.render('info', { pass: rows[0] });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`App is running at http://localhost:${port}`);
});