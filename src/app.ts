import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import path from 'node:path';
import oidc from 'express-openid-connect';
import { auth as jwtAuth, requiredScopes } from 'express-oauth2-jwt-bearer';
import QRCode from 'qrcode';
import { pool } from './db.ts';

const { auth, requiresAuth } = oidc;

const app = express();
app.set('view engine', 'pug');
app.set('views', path.join(import.meta.dirname, 'views'));
app.set('trust proxy', true);

const port = Number(process.env.PORT) || 3000;
const baseURL = process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${port}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.use(auth({
  authRequired: false,
  idpLogout: true,
  secret: process.env.SESSION_SECRET,
  baseURL,
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  issuerBaseURL: process.env.AUTH0_DOMAIN,
  authorizationParams: {
    response_type: 'code',
    scope: 'openid profile email',
  },
}));

const checkJwt = jwtAuth({
  audience: process.env.API_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_DOMAIN,
});

app.get('/', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status = 'ACTIVE')::int AS active
    FROM passes
  `);
  res.render('index', {
    total: rows[0].total,
    active: rows[0].active,
    loggedIn: req.oidc.isAuthenticated(),
    username: req.oidc.user?.name ?? req.oidc.user?.email,
  });
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

app.get('/admin/passes', requiresAuth(), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, document, issued_at, status FROM passes ORDER BY issued_at DESC'
  );
  res.render('passes', { passes: rows });
});

app.post('/admin/passes/:id/cancel', requiresAuth(), async (req, res) => {
  const { id } = req.params;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return res.sendStatus(404);
  await pool.query("UPDATE passes SET status = 'CANCELLED' WHERE id = $1", [id]);
  res.redirect('/admin/passes');
});

app.post('/admin/passes/:id/delete', requiresAuth(), async (req, res) => {
  const { id } = req.params;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return res.sendStatus(404);
  await pool.query('DELETE FROM passes WHERE id = $1', [id]);
  res.redirect('/admin/passes');
});

app.get('/passes/:id', checkJwt, requiredScopes('read:passes'), async (req, res) => {
  const { id } = req.params;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return res.sendStatus(404);

  const { rows } = await pool.query(
    'SELECT id, name, document, issued_at, status FROM passes WHERE id = $1',
    [id]
  );
  if (rows.length === 0) return res.sendStatus(404);

  const p = rows[0];
  res.json({
    id: p.id,
    name: p.name,
    document: p.document,
    issuedAt: p.issued_at.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    status: p.status,
  });
});

app.post('/passes', checkJwt, requiredScopes('create:passes'), express.json(), async (req, res) => {
  const { name, document } = req.body ?? {};
  if (typeof name !== 'string' || name.trim() === '' ||
      typeof document !== 'string' || document.trim() === '') {
    return res.status(400).json({ error: 'name i document su obavezni' });
  }

  const { rows } = await pool.query(
    'INSERT INTO passes (name, document) VALUES ($1, $2) RETURNING id',
    [name.trim(), document.trim()]
  );
  const id: string = rows[0].id;

  const publicUrl = `${baseURL}/info/${id}`; 
  const apiUrl = `${baseURL}/passes/${id}`; 

  const png = await QRCode.toBuffer(publicUrl);
  res.status(201).location(apiUrl).type('image/png').send(png);
});

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(err);
  if (err.headers) res.set(err.headers);
  res.status(status).json({ error: status >= 500 ? 'Internal Server Error' : err.message });
};
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Aplikacija radi na ${baseURL}`);
});