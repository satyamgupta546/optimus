import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

import widgetsRouter from './routes/widgets.js';
import requestsRouter from './routes/requests.js';
import usersRouter from './routes/users.js';
import catalogRouter from './routes/catalog.js';
import activityRouter from './routes/activity.js';
import headerWidgetsRouter from './routes/headerWidgets.js';
import mediaRouter from './routes/media.js';
import locationsRouter from './routes/locations.js';
import kineticRouter from './routes/kinetic.js';

const app = express();
const PORT = process.env.PORT || 3001;

const BACKENDS = {
  prod: 'https://samaan.apnamart.in',
  uat: 'https://smapi-cu.apnamart.in',
};

// ── Middleware ──
app.use(cors());

// ── Backend proxy (before body parsers — needs raw body) ──
app.all('/api/local/proxy/:env/{*path}', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  const backend = BACKENDS[req.params.env];
  if (!backend) return res.status(400).json({ error: 'Invalid env' });

  const targetPath = Array.isArray(req.params.path) ? req.params.path.join('/') : (req.params.path || '');
  const qs = req.url.includes('?') ? '?' + req.url.split('?')[1] : '';
  const url = `${backend}/${targetPath}${qs}`;

  // Forward select request headers — override Referer/Origin to match backend
  // (Django CSRF validates Referer origin must match the server host)
  const headers = {};
  for (const h of ['content-type', 'cookie', 'x-csrftoken', 'accept']) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }
  headers['referer'] = `${backend}/`;
  headers['origin'] = backend;

  try {
    const fetchOpts = { method: req.method, headers, redirect: 'manual' };
    if (req.body && req.body.length) fetchOpts.body = req.body;

    const upstream = await fetch(url, fetchOpts);

    // Forward status
    res.status(upstream.status);

    // Forward Set-Cookie headers first (handle separately to avoid duplicates)
    const setCookies = upstream.headers.getSetCookie ? upstream.headers.getSetCookie() : [];
    setCookies.forEach(c => {
      const cleaned = c.replace(/;\s*Domain=[^;]*/gi, '').replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=[^;]*/gi, '; SameSite=Lax');
      res.append('Set-Cookie', cleaned);
    });

    // Forward other response headers
    for (const [key, value] of upstream.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower === 'transfer-encoding' || lower === 'content-encoding' || lower === 'set-cookie') continue;
      if (lower === 'location') {
        res.setHeader('Location', value.replace(backend, `/api/local/proxy/${req.params.env}`));
        continue;
      }
      res.setHeader(key, value);
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.end(body);
  } catch (err) {
    console.error('[proxy] Error:', err.message);
    res.status(502).json({ error: 'Proxy error', detail: err.message });
  }
});

// ── Body parsers (after proxy) ──
app.use(express.json({ limit: '10mb' }));

// ── Public routes (no auth — served by <img> tags which can't send headers) ──
app.use('/api/local/media', mediaRouter);

app.use('/api/local', authMiddleware);

// ── Routes ──
app.get('/api/local/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/local/widgets', widgetsRouter);
app.use('/api/local/requests', requestsRouter);
app.use('/api/local/users', usersRouter);
app.use('/api/local/catalog', catalogRouter);
app.use('/api/local/activity', activityRouter);
app.use('/api/local/header-widgets', headerWidgetsRouter);
app.use('/api/local/locations', locationsRouter);
app.use('/api/local/kinetic', kineticRouter);

// ── Error Handler ──
app.use(errorHandler);

// ── Start (skip on Vercel — serverless) ──
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[optimus-api] Running on http://localhost:${PORT}`);
  });
}

export default app;
