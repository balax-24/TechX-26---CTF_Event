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

function login(identifier: string, pass: string): Promise<number> {
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
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          const lat = Date.now() - start;
          if (res.statusCode === 200) {
            resolve(lat);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${b}`));
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
  const pool = [...TEAMS, ...TEAMS, ...TEAMS, ...TEAMS]; // 14 * 4 = 56 simultaneous logins
  console.log(`\n============================================================`);
  console.log(`🚀 STRESS TESTING 56 SIMULTANEOUS TEAM LOGINS (4 PER TEAM CONCURRENT)`);
  console.log(`============================================================`);

  const start = Date.now();
  const results = await Promise.allSettled(pool.map((t) => login(t.identifier, t.pass)));
  const elapsed = (Date.now() - start) / 1000;

  const passed = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log(`Total Logins Attempted: ${pool.length}`);
  console.log(`Successful:             ${passed}`);
  console.log(`Failed:                 ${failed}`);
  console.log(`Total Elapsed Time:     ${elapsed.toFixed(3)}s`);
  console.log(`Average Latency:        ${((elapsed / pool.length) * 1000).toFixed(1)}ms`);

  if (failed === 0) {
    console.log(`✅ 100% SUCCESS: All 56 concurrent logins succeeded simultaneously without error!`);
  } else {
    console.log(`❌ Some failed:`, results.find((r) => r.status === 'rejected'));
  }
}

run();
