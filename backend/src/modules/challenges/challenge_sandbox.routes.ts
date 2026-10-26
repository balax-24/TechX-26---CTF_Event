import { FastifyInstance, FastifyPluginAsync } from 'fastify';

export const challengeSandboxRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ---------------------------------------------------------------------------
  // 1. Challenge 1: Portal of Secrets (/web-intro-portal/telemetry)
  // ---------------------------------------------------------------------------
  app.get('/web-intro-portal/telemetry', async (req, reply) => {
    const { debug, role, admin } = req.query as Record<string, string | undefined>;
    const isAdmin = admin === 'true' || role === 'admin';

    if (debug === '1' && isAdmin) {
      return reply.send({
        status: 'success',
        telemetry: {
          gateway: 'internal-gw-01',
          uptime: 86400,
          mode: 'diagnostic_admin',
          flag: 'techx{web_b4s1c_1d0r_d3t3ct3d}',
        },
      });
    }

    return reply.send({
      status: 'success',
      telemetry: {
        gateway: 'internal-gw-01',
        uptime: 86400,
        mode: 'standard_guest',
        message: 'Restricted telemetry mode. Supply administrative query parameters for diagnostic telemetry.',
      },
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Challenge 6: Source Trace (/sandbox/source-trace)
  // ---------------------------------------------------------------------------
  app.get('/sandbox/source-trace', async (_req, reply) => {
    reply.type('text/html');
    return reply.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Syndicate Operations Terminal</title>
  <style>
    body { background: #0f172a; color: #f8fafc; font-family: monospace; padding: 40px; }
    .card { background: #1e293b; border: 1px solid #334155; padding: 24px; border-radius: 8px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5); }
    h1 { color: #ba68c8; font-size: 20px; border-bottom: 1px solid #334155; padding-bottom: 10px; }
    .badge { display: inline-block; background: #065f46; color: #34d399; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>SYNDICATE OPERATIONS TERMINAL v2.4</h1>
    <p>Operational Status: <span class="badge">ONLINE</span></p>
    <p>Telemetry stream active on gateway node-01.</p>
    <!-- SECRET_DEVELOPER_KEY: techx{cl13nt_s1d3_s0urc3_1nsp3ct10n_ftw} -->
    <p style="color: #94a3b8; font-size: 13px;">Hint: Review client-side structure and documentation tags for deployment confirmation.</p>
  </div>
</body>
</html>`);
  });

  // ---------------------------------------------------------------------------
  // 3. Challenge 7: Robots Don't Lie (/sandbox/robots-site)
  // ---------------------------------------------------------------------------
  app.get('/sandbox/robots-site', async (_req, reply) => {
    reply.type('text/html');
    return reply.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Syndicate Public Portal</title>
  <style>
    body { background: #0b0f19; color: #e2e8f0; font-family: sans-serif; padding: 40px; }
    .box { background: #131b2e; border: 1px solid #1e293b; padding: 24px; border-radius: 6px; max-width: 640px; margin: 0 auto; }
    h2 { color: #38bdf8; }
    code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #f43f5e; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Syndicate Public Portal</h2>
    <p>Welcome to the public-facing syndicate portal. Search engines crawl this service regularly.</p>
    <p>Web crawlers follow standard robots exclusion policies. Have you checked the robots file?</p>
  </div>
</body>
</html>`);
  });

  app.get('/sandbox/robots-site/robots.txt', async (_req, reply) => {
    reply.type('text/plain');
    return reply.send(`User-agent: *
Disallow: /api/v1/challenges/sandbox/robots-site/syndicate-secret-vault-7718/
`);
  });

  app.get('/sandbox/robots-site/syndicate-secret-vault-7718/', async (_req, reply) => {
    reply.type('text/html');
    return reply.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Secret Vault</title></head>
<body style="background:#090d16;color:#38bdf8;font-family:monospace;padding:50px;">
  <h2>Syndicate Classified Vault 7718</h2>
  <p>Disallowed Crawler Discovery Confirmed.</p>
  <p style="font-size:18px;color:#a855f7;background:#1e1b4b;padding:12px;border:1px solid #4338ca;border-radius:4px;display:inline-block;">
    Flag: techx{r0b0ts_txt_1s_n0t_4cc3ss_c0ntr0l_2026}
  </p>
</body>
</html>`);
  });

  // ---------------------------------------------------------------------------
  // 4. Challenge 13: Cookie Trail (/sandbox/cookie-trail)
  // ---------------------------------------------------------------------------
  app.get('/sandbox/cookie-trail', async (req, reply) => {
    const rawCookie = req.cookies?.session_auth;

    if (!rawCookie) {
      const defaultPayload = Buffer.from(JSON.stringify({ role: 'visitor' })).toString('base64');
      reply.setCookie('session_auth', defaultPayload, { path: '/', httpOnly: false });
      return reply.send({
        status: 'visitor',
        cookie_assigned: 'session_auth',
        current_role: 'visitor',
        message: 'Welcome! A session_auth cookie has been set. Only users with role "admin" are permitted to inspect confidential syndicate records.',
      });
    }

    try {
      const decoded = Buffer.from(rawCookie, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);

      if (parsed.role === 'admin') {
        return reply.send({
          status: 'admin_granted',
          message: 'Cookie verification successful! Privilege elevation confirmed.',
          flag: 'techx{c00k13_m4n1pul4t10n_3l3v4t10n_2026}',
        });
      }

      return reply.send({
        status: 'access_denied',
        current_role: parsed.role,
        message: `Current session role is "${parsed.role}". To view the flag, modify the cookie payload so role is "admin".`,
      });
    } catch {
      return reply.badRequest('Invalid base64/JSON in session_auth cookie');
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Challenge 14: Header Hunt (/sandbox/header-hunt)
  // ---------------------------------------------------------------------------
  app.get('/sandbox/header-hunt', async (_req, reply) => {
    reply.header('X-TechX-Secret-Transmission', 'techx{http_r3sp0ns3_h34d3rs_r3v34l_s3cr3ts}');
    reply.header('X-Transmission-Timestamp', new Date().toISOString());
    return reply.send({
      status: 'success',
      message: 'Transmission received. The confidential payload was transmitted via custom HTTP response headers.',
      hint: 'Inspect HTTP response headers using browser DevTools (Network tab) or curl -I.',
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Challenge 15: Simple IDOR (/sandbox/simple-idor)
  // ---------------------------------------------------------------------------
  app.get('/sandbox/simple-idor', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const targetId = query.id || '101';

    if (targetId === '1' || targetId === '0') {
      return reply.send({
        user_id: 1,
        name: 'Chief Security Officer (Founder)',
        role: 'executive_admin',
        clearance: 'TOP_SECRET',
        confidential_memo: 'Security clearance verified. Master key: techx{1d0r_d1r3ct_0bj3ct_r3f3r3nc3_byp4ss}',
      });
    }

    return reply.send({
      user_id: parseInt(targetId, 10) || 101,
      name: `Staff Operator #${targetId}`,
      role: 'junior_analyst',
      clearance: 'STANDARD_RESTRICTED',
      bio: 'Routine logistics operator. No administrative clearance granted.',
      hint: 'Notice the id parameter in the URL. What happens if you request the founder profile at id=1?',
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Challenge 19: API Discovery (/sandbox/api-explorer/*)
  // ---------------------------------------------------------------------------
  app.get('/sandbox/api-explorer/status', async (_req, reply) => {
    return reply.send({
      service: 'Syndicate Microservices Gateway',
      version: '2.4.1',
      status: 'healthy',
      active_nodes: 8,
      documentation_url: '/api/v1/challenges/sandbox/api-explorer/docs',
    });
  });

  app.get('/sandbox/api-explorer/docs', async (_req, reply) => {
    return reply.send({
      documentation: 'Syndicate Internal API v2.4 Reference',
      endpoints: [
        { path: '/api/v1/challenges/sandbox/api-explorer/status', method: 'GET', description: 'System health & uptime' },
        { path: '/api/v1/challenges/sandbox/api-explorer/docs', method: 'GET', description: 'API schema reference' },
        { path: '/api/v1/challenges/sandbox/api-explorer/internal/vault', method: 'GET', description: 'Classified internal telemetry vault (Classified)' },
      ],
    });
  });

  app.get('/sandbox/api-explorer/internal/vault', async (_req, reply) => {
    return reply.send({
      vault_id: 'VAULT-ALPHA-771',
      classification: 'TOP_SECRET',
      author: 'Syndicate Chief Architect',
      flag: 'techx{4p1_3ndp01nt_3num3r4t10n_succ3ss_2026}',
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Challenge 4: Intro SQLi Sandbox (/sandbox/sqli-login)
  // ---------------------------------------------------------------------------
  app.get('/sandbox/sqli-login', async (_req, reply) => {
    reply.type('text/html');
    return reply.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Syndicate Auth Terminal</title>
  <style>
    body { background: #0b0f19; color: #f8fafc; font-family: monospace; padding: 40px; }
    .card { background: #131b2e; border: 1px solid #1e293b; padding: 30px; border-radius: 8px; max-width: 480px; margin: 0 auto; }
    h2 { color: #38bdf8; margin-top: 0; }
    label { display: block; margin: 12px 0 4px; color: #94a3b8; font-size: 13px; }
    input[type="text"], input[type="password"] { width: 100%; box-sizing: border-box; padding: 8px 12px; background: #090d16; border: 1px solid #334155; color: #f8fafc; border-radius: 4px; }
    button { margin-top: 18px; width: 100%; padding: 10px; background: #6366f1; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
    button:hover { background: #4f46e5; }
    .hint { margin-top: 15px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Syndicate Access Terminal</h2>
    <form method="POST" action="/api/v1/challenges/sandbox/sqli-login">
      <label>Username</label>
      <input type="text" name="username" placeholder="admin" required />
      <label>Password</label>
      <input type="password" name="password" placeholder="••••••••" required />
      <button type="submit">Authenticate</button>
    </form>
    <div class="hint">Query pattern: <code>SELECT * FROM users WHERE username = 'USER' AND password = 'PASS'</code></div>
  </div>
</body>
</html>`);
  });

  app.post('/sandbox/sqli-login', async (req, reply) => {
    const body = (req.body || {}) as Record<string, string | undefined>;
    const username = body.username || '';

    // Check for classic SQL injection logic bypass: ' OR ... -- or ' or ... #
    const isBypass =
      username.includes("'") &&
      (username.toUpperCase().includes('OR') || username.includes('||')) &&
      (username.includes('--') || username.includes('#') || username.includes("'='"));

    if (isBypass) {
      return reply.send({
        authenticated: true,
        user: 'administrator',
        message: 'SQL Injection authentication bypass successful!',
        query_executed: `SELECT * FROM users WHERE username = '${username}' AND password = '...'`,
        flag: 'techx{sql1_l0g1n_byp4ss_succ3ssful_2026}',
      });
    }

    return reply.send({
      authenticated: false,
      error: 'Invalid credentials. Query evaluated to FALSE.',
      query_executed: `SELECT * FROM users WHERE username = '${username.replace(/'/g, "''")}' AND password = '***'`,
    });
  });
};
