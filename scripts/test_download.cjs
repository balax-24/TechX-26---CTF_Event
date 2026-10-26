const http = require('http');

const targetHost = process.env.TARGET_HOST || '127.0.0.1';

const req = http.request({
  host: targetHost,
  port: 80,
  path: '/api/v1/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log('Login status:', res.statusCode);
    const cookie = res.headers['set-cookie'];
    if (!cookie) {
      console.error('No cookie returned! Body:', data);
      process.exit(1);
    }
    const cookieHeader = cookie.map(c => c.split(';')[0]).join('; ');

    const fileReq = http.request({
      host: targetHost,
      port: 80,
      path: '/api/v1/challenges/web-intro-portal/files/5abfa0f2-2995-401c-a385-33f34fc70536',
      method: 'GET',
      headers: { 'Cookie': cookieHeader }
    }, fileRes => {
      console.log('File status:', fileRes.statusCode);
      console.log('File headers:', fileRes.headers);
      const chunks = [];
      fileRes.on('data', d => chunks.push(d));
      fileRes.on('end', () => {
        const full = Buffer.concat(chunks);
        console.log('Downloaded bytes:', full.length);
        console.log('PK signature (expect 504b0304):', full.slice(0, 4).toString('hex'));
        if (fileRes.statusCode === 200 && full.length === 1304 && full.slice(0, 4).toString('hex') === '504b0304') {
          console.log('[SUCCESS] Download verified! File is valid zip archive.');
          process.exit(0);
        } else {
          console.error('[FAILURE] Unexpected status or size');
          process.exit(1);
        }
      });
    });
    fileReq.end();
  });
});

req.write(JSON.stringify({ email: 'participant@example.com', password: 'participant1234' }));
req.end();
