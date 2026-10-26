import http from 'http';

const TEAMS = [
  { identifier: 'amusedtitans', pass: 'Amusedtitans@TX26' },
  { identifier: 'bitsybytes', pass: 'Bitsybytes@TX26' },
  { identifier: 'c1cc4d0', pass: 'C1Cc4D0@TX26' },
  { identifier: 'hawkerz', pass: 'Hawkerz@TX26' },
  { identifier: 'martysupreme', pass: 'Martysupreme@TX26' },
  { identifier: 'neuralnexus', pass: 'Neuralnexus@TX26' },
  { identifier: 'nothackers', pass: 'Nothackers@TX26' },
  { identifier: 'outofbounds', pass: 'Outofbounds@TX26' },
  { identifier: 'pluripotent', pass: 'Pluripotent@TX26' },
  { identifier: 'teamalpha', pass: 'Teamalpha@TX26' },
  { identifier: 'teamsigma', pass: 'Teamsigma@TX26' },
  { identifier: 'technova', pass: 'Technova@TX26' },
  { identifier: 'techfinix', pass: 'Techfinix@TX26' },
  { identifier: 'zyntra', pass: 'Zyntra@TX26' },
];

function loginRequest(identifier: string, pass: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ identifier, password: pass });
    const start = Date.now();
    const req = http.request(
      'http://127.0.0.1:80/api/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          const latency = Date.now() - start;
          if (res.statusCode === 200) {
            resolve(latency);
          } else {
            reject(new Error(`Failed with status ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function run() {
  console.log(`\n============================================================`);
  console.log(`🔐 TESTING 28 SIMULTANEOUS REAL TEAM LOGINS (2 CONCURRENT USERS PER TEAM)`);
  console.log(`============================================================`);

  const tasks: Promise<number>[] = [];
  const testPool = [...TEAMS, ...TEAMS]; // 28 concurrent logins

  const startTime = Date.now();
  for (const t of testPool) {
    tasks.push(loginRequest(t.identifier, t.pass));
  }

  const results = await Promise.allSettled(tasks);
  const duration = (Date.now() - startTime) / 1000;
  const successful = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log(`Results: ${successful} / ${testPool.length} successful logins in ${duration.toFixed(3)}s.`);
  if (failed > 0) {
    const rejectedReasons = results.filter((r) => r.status === 'rejected').map((r: any) => r.reason?.message);
    console.error('Sample rejection:', rejectedReasons[0]);
  } else {
    console.log(`✅ ALL 28 CONCURRENT TEAM LOGINS AUTHENTICATED SUCCESSFULLY!`);
  }
}

run();
