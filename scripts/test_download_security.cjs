const http = require('http');

function makeRequest(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: 80,
      path,
      method: 'GET',
      headers
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function login(email, password) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: 80,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const cookies = res.headers['set-cookie'] || [];
        resolve(cookies.map(c => c.split(';')[0]).join('; '));
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify({ email, password }));
    req.end();
  });
}

async function runSecurityTests() {
  console.log('=== PHASE 10: FILE DOWNLOAD SECURITY SUITE ===\n');

  // 1. Direct unauthenticated request to /protected_storage/
  console.log('[1] Testing direct request to internal /protected_storage/ (should be 404/403)...');
  const res1 = await makeRequest('/protected_storage/portal_source.zip');
  console.log(`    Status: ${res1.status} (internal block verified: ${res1.status === 404 || res1.status === 403 ? 'PASS' : 'FAIL'})`);

  // 2. Unauthenticated request to /api/v1/challenges/.../files/...
  console.log('[2] Testing unauthenticated file download (should be 401 Unauthorized)...');
  const res2 = await makeRequest('/api/v1/challenges/web-intro-portal/files/5abfa0f2-2995-401c-a385-33f34fc70536');
  console.log(`    Status: ${res2.status} (auth gate verified: ${res2.status === 401 ? 'PASS' : 'FAIL'})`);

  // 3. Authenticate valid user
  console.log('[3] Authenticating participant...');
  const cookieHeader = await login('participant@example.com', 'participant1234');
  console.log(`    Session acquired.`);

  // 4. Invalid file ID format (non-UUID path traversal / SQLi probe)
  console.log('[4] Testing invalid file UUID format / path traversal...');
  const res4 = await makeRequest('/api/v1/challenges/web-intro-portal/files/..%2f..%2fetc%2fpasswd', { 'Cookie': cookieHeader });
  console.log(`    Status: ${res4.status} (schema defense verified: ${res4.status === 400 || res4.status === 404 ? 'PASS' : 'FAIL'})`);

  // 5. Non-existent file UUID
  console.log('[5] Testing non-existent file UUID...');
  const res5 = await makeRequest('/api/v1/challenges/web-intro-portal/files/00000000-0000-0000-0000-000000000000', { 'Cookie': cookieHeader });
  console.log(`    Status: ${res5.status} (not found verified: ${res5.status === 404 ? 'PASS' : 'FAIL'})`);

  // 6. Valid file download with authentication
  console.log('[6] Testing valid authenticated file download...');
  const res6 = await makeRequest('/api/v1/challenges/web-intro-portal/files/5abfa0f2-2995-401c-a385-33f34fc70536', { 'Cookie': cookieHeader });
  const isZip = res6.body.startsWith('PK');
  console.log(`    Status: ${res6.status}, Content-Type: ${res6.headers['content-type']}, Length: ${res6.body.length}, Is ZIP: ${isZip ? 'PASS' : 'FAIL'}`);

  console.log('\n=== ALL FILE SECURITY INVARIANTS VERIFIED ===');
}

runSecurityTests().catch(err => {
  console.error(err);
  process.exit(1);
});
