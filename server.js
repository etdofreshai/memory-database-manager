import express from 'express';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const UI_PASSWORD = process.env.UI_PASSWORD || '';
const COOKIE_NAME = 'mdb_auth';
// sessions live 7 days
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();

// Service configurations
const services = {
  'memory-api': {
    url: (process.env.MEMORY_API_URL || 'http://dokploy-memory-database-api-lxfp0i:3000').replace(/\/$/, ''),
    token: process.env.MEMORY_API_TOKEN || '',
  },
  'discord-ingestor': {
    url: (process.env.DISCORD_INGESTOR_URL || '').replace(/\/$/, ''),
    token: process.env.DISCORD_INGESTOR_TOKEN || '',
  },
  'gmail-ingestor': {
    url: (process.env.GMAIL_INGESTOR_URL || '').replace(/\/$/, ''),
    token: process.env.GMAIL_INGESTOR_TOKEN || '',
  },
  'slack-ingestor': {
    url: (process.env.SLACK_INGESTOR_URL || '').replace(/\/$/, ''),
    token: process.env.SLACK_INGESTOR_TOKEN || '',
  },
  'anthropic-ingestor': {
    url: (process.env.ANTHROPIC_INGESTOR_URL || '').replace(/\/$/, ''),
    token: process.env.ANTHROPIC_INGESTOR_TOKEN || '',
  },
  'chatgpt-ingestor': {
    url: (process.env.CHATGPT_INGESTOR_URL || '').replace(/\/$/, ''),
    token: process.env.CHATGPT_INGESTOR_TOKEN || '',
  },
  'openclaw-ingestor': {
    url: (process.env.OPENCLAW_INGESTOR_URL || '').replace(/\/$/, ''),
    token: process.env.OPENCLAW_INGESTOR_TOKEN || '',
  },
  'whatsapp-ingestor': {
    url: (process.env.WHATSAPP_INGESTOR_URL || '').replace(/\/$/, ''),
    token: process.env.WHATSAPP_INGESTOR_TOKEN || '',
  },
};

const app = express();
app.use(express.json());

// ── Auth helpers ──────────────────────────────────────────
function isValidAuth(req) {
  if (!UI_PASSWORD) return true; // no password set = open access
  const token = req.cookies?.[COOKIE_NAME] || parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (!token) return false;
  const entry = sessions.get(token);
  if (!entry) return false;
  if (Date.now() - entry.ts > SESSION_TTL) { sessions.delete(token); return false; }
  return true;
}

function parseCookies(str) {
  const out = {};
  for (const part of str.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = v.join('=');
  }
  return out;
}

// Auth status endpoint (no middleware — always reachable)
app.get('/auth/status', (_req, res) => {
  res.json({ required: !!UI_PASSWORD });
});

// Login endpoint
app.post('/auth/login', (req, res) => {
  if (!UI_PASSWORD) return res.json({ ok: true }); // no password needed
  const { password } = req.body || {};
  if (password !== UI_PASSWORD) return res.status(401).json({ ok: false, error: 'Invalid password' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { ts: Date.now() });
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL / 1000)}`);
  return res.json({ ok: true });
});

// Logout endpoint
app.post('/auth/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  res.json({ ok: true });
});

// Auth gate middleware — skip if no password configured
app.use((req, res, next) => {
  if (!UI_PASSWORD) return next();
  // Allow auth endpoints and static assets through
  if (req.path.startsWith('/auth/')) return next();
  if (req.path === '/' || req.path === '/index.html') {
    // Serve the SPA even when not authed — the frontend login gate handles it
    return next();
  }
  if (!isValidAuth(req)) return res.status(401).json({ error: 'Authentication required' });
  next();
});

// Service config endpoint (tells frontend which services are configured)
app.get('/service-config', (_req, res) => {
  const config = {};
  for (const [name, svc] of Object.entries(services)) {
    config[name] = { configured: !!svc.url };
  }
  res.json(config);
});

// Generic proxy function
function proxyRequest(serviceUrl, serviceToken, req, res) {
  const targetUrl = new URL(serviceUrl);
  const agent = targetUrl.protocol === 'https:' ? https : http;
  const path = req.url;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
      ...(serviceToken ? { authorization: `Bearer ${serviceToken}` } : {}),
    },
  };

  const proxy = agent.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Backend unavailable', detail: err.message });
    }
  });

  req.pipe(proxy);
}

// Proxy routes for each service
for (const [name, svc] of Object.entries(services)) {
  app.use(`/proxy/${name}`, (req, res) => {
    if (!svc.url) {
      return res.status(503).json({ error: `${name} not configured` });
    }
    proxyRequest(svc.url, svc.token, req, res);
  });
}

// Backward compat: /api/* → memory-api
app.use('/api', (req, res) => {
  const svc = services['memory-api'];
  const path = '/api' + req.url;
  const targetUrl = new URL(svc.url);
  const agent = targetUrl.protocol === 'https:' ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
      authorization: `Bearer ${svc.token}`,
    },
  };

  const proxy = agent.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Backend unavailable', detail: err.message });
    }
  });

  req.pipe(proxy);
});

app.use(express.static(join(__dirname, 'dist')));
app.get('*', (_req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));

const server = http.createServer(app);

// WebSocket proxy for /proxy/<service>/... paths
server.on('upgrade', (req, socket, head) => {
  const match = req.url?.match(/^\/proxy\/([^/]+)(\/.*)/);
  if (!match) {
    socket.destroy();
    return;
  }
  const [, serviceName, path] = match;
  const svc = services[serviceName];
  if (!svc?.url) {
    socket.destroy();
    return;
  }

  const targetUrl = new URL(svc.url);
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path,
    method: 'GET',
    headers: {
      ...req.headers,
      host: targetUrl.host,
      ...(svc.token ? { authorization: `Bearer ${svc.token}` } : {}),
    },
  };

  const agent = targetUrl.protocol === 'https:' ? https : http;
  const proxyReq = agent.request(options);

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n'
    );
    if (proxyHead.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
  });

  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
});

server.listen(PORT, () => console.log(`Server listening on :${PORT}`));
