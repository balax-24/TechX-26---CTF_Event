import { eq } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import {
  categories,
  challenges,
  checkpoints,
  hints,
  challengeFiles,
  competitionState,
} from '../db/schema.js';
import { hashFlag } from '../utils/flags.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

export async function seedStagingEvent() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_STAGING_SEED !== 'true') {
    throw new Error('SAFETY ABORT: seedStagingEvent cannot be executed in NODE_ENV=production without ALLOW_STAGING_SEED=true');
  }
  logger.info('Initializing TechX CTF 2026 Challenge Content Expansion (20 Operational Targets)...');

  // 1. Competition State
  const compStart = new Date(Date.now() - 3600000); // Started 1 hour ago
  const compEnd = new Date(Date.now() + 48 * 3600000); // Ends in 48 hours (2-day event)
  const regStart = new Date(Date.now() - 7 * 86400000); // Opened 7 days ago
  const regEnd = new Date(Date.now() + 24 * 3600000); // Closes in 24 hours

  await db
    .insert(competitionState)
    .values({
      id: 'default',
      name: 'TechX CTF 2026',
      state: 'live',
      startTime: compStart,
      endTime: compEnd,
      registrationStartTime: regStart,
      registrationEndTime: regEnd,
      timezone: 'Asia/Kolkata',
      isSubmissionEnabled: true,
      defaultChallengeVisibility: 'published',
    })
    .onConflictDoUpdate({
      target: competitionState.id,
      set: {
        state: 'live',
        startTime: compStart,
        endTime: compEnd,
        isSubmissionEnabled: true,
      },
    });
  logger.info('✓ Competition state verified LIVE (2-day active window)');

  // 2. Categories
  const categoryDefs = [
    { name: 'Web Exploitation', slug: 'web', description: 'Web app security, injection, parameter tampering, auth bypass', displayOrder: 1 },
    { name: 'Cryptography', slug: 'crypto', description: 'Ciphers, XOR, encoding, modular arithmetic, cryptanalysis', displayOrder: 2 },
    { name: 'Forensics', slug: 'forensics', description: 'Log analysis, file metadata, steganography, data recovery', displayOrder: 3 },
    { name: 'Network Security', slug: 'network', description: 'PCAP packet inspection, protocol analysis, stream analysis', displayOrder: 4 },
    { name: 'Reverse Engineering', slug: 'rev', description: 'Algorithm reversing, matrix constraints, key validation', displayOrder: 5 },
    { name: 'Binary Exploitation', slug: 'pwn', description: 'Memory corruption, buffer overflows, control flow hijacks', displayOrder: 6 },
  ];

  const catMap = new Map<string, string>();
  for (const cat of categoryDefs) {
    const [inserted] = await db
      .insert(categories)
      .values(cat)
      .onConflictDoUpdate({
        target: categories.slug,
        set: { name: cat.name, description: cat.description, displayOrder: cat.displayOrder },
      })
      .returning();
    catMap.set(cat.slug, inserted.id);
  }
  logger.info(`✓ Seeded ${catMap.size} standardized competition categories`);

  // Static storage path resolution
  const staticDir =
    process.env.CHALLENGE_FILES_DIR ||
    (fs.existsSync('/data/challenges/static')
      ? '/data/challenges/static'
      : path.resolve(process.cwd(), '../data/challenges/static'));

  function getFileMeta(filename: string) {
    const fullPath = path.join(staticDir, filename);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`CRITICAL: Static challenge artifact not found at ${fullPath}`);
    }
    const buffer = fs.readFileSync(fullPath);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    return {
      filePath: fullPath,
      size: buffer.length,
      checksum,
    };
  }

  // 3. Challenge Definitions (Total = 20: 18 Accessible, 2 Expert)
  const challengeDefinitions = [
    // -------------------------------------------------------------------------
    // 1. Portal of Secrets (Web, Beginner, 100 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'web-intro-portal',
      title: 'Portal of Secrets',
      category: 'web',
      difficulty: 'beginner',
      points: 100,
      author: 'TechX Security Team',
      story: 'An internal reconnaissance scan detected an administrative telemetry gateway exposed by the syndicate. The client application attempts to mask privileged telemetry endpoints from unauthenticated visitors.',
      description: `STORY:
An internal reconnaissance scan detected an administrative telemetry gateway exposed by the syndicate. The client application attempts to mask privileged telemetry endpoints from unauthenticated visitors.

OBJECTIVE:
Inspect the client-side portal bundle, determine how telemetry queries are structured, and query the endpoint with administrative privileges to reveal the hidden key.

WHAT YOU HAVE ACCESS TO:
1. Downloadable source bundle: portal_source.zip (attached below)
2. Live target endpoint: /api/v1/challenges/web-intro-portal/telemetry

START HERE:
Download and unpack portal_source.zip. Open portal.js and trace the query parameters used when contacting the telemetry gateway.`,
      flag: 'techx{web_b4s1c_1d0r_d3t3ct3d}',
      file: 'portal_source.zip',
      connectionInfo: '/api/v1/challenges/web-intro-portal/telemetry',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: Look at portal.js in the extracted archive. What URL endpoint does queryTelemetry() contact, and what query parameters are passed in the URL?',
          penaltyPoints: 10,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: The code comments in portal.js explain that debug=1 and admin=true cause the gateway to leak confidential logs. What happens if you request the endpoint with those parameters?',
          penaltyPoints: 20,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Make a direct HTTP GET request in your browser to: /api/v1/challenges/web-intro-portal/telemetry?debug=1&admin=true. Inspect the JSON response object to find the flag.',
          penaltyPoints: 30,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 2. Quantum XOR (Crypto, Beginner, 100 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'crypto-quantum-xor',
      title: 'Quantum XOR',
      category: 'crypto',
      difficulty: 'beginner',
      points: 100,
      author: 'QuantumLab',
      story: 'An intercepted communications channel from the syndicate\'s quantum telemetry array was captured. Analysis reveals their encryption routine had a catastrophic entropy failure: the secret key was initialized entirely to null bytes (all zeros).',
      description: `STORY:
An intercepted communications channel from the syndicate's quantum telemetry array was captured. Analysis reveals their encryption routine had a catastrophic entropy failure: the secret key was initialized entirely to null bytes (all zeros).

OBJECTIVE:
Decrypt the intercepted hexadecimal transmission by reversing the XOR stream with the all-zero key.

INTERCEPTED TRANSMISSION (HEXADECIMAL):
74656368787b7830725f31735f6e30745f336e637279707431306e5f7768336e5f6b33795f31735f7a3372307d

START HERE:
Examine the hex string provided above. Remember the fundamental mathematical rule of bitwise XOR: what is the result when any byte is XORed with 0x00?`,
      flag: 'techx{x0r_1s_n0t_3ncrypt10n_wh3n_k3y_1s_z3r0}',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: In boolean logic, XOR with 0 does not alter the original bits: A ^ 0 = A. What does this mean for data encrypted with an all-zero key?',
          penaltyPoints: 10,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: Since XORing with zero leaves every byte unchanged, the ciphertext bytes are already identical to the original plaintext bytes! You just need to convert hexadecimal into ASCII text.',
          penaltyPoints: 20,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Open CyberChef or Python and decode the hex string 7465636878... using "From Hex". The flag will immediately appear.',
          penaltyPoints: 30,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 3. Structured Leakage (Web, Intermediate, 200 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'web-sqli-checkpoint',
      title: 'Structured Leakage',
      category: 'web',
      difficulty: 'intermediate',
      points: 200,
      author: 'ByteWizard',
      story: 'An outdated knowledge-base search engine on the internal network constructs raw SQL queries using direct string concatenation. Security analysts believe UNION-based SQL injection can be chained to dump secret database tables.',
      description: `STORY:
An outdated knowledge-base search engine on the internal network constructs raw SQL queries using direct string concatenation. Security analysts believe UNION-based SQL injection can be chained to dump secret database tables.

OBJECTIVE:
Progress through the SQL injection checkpoints: determine the query column count (Checkpoint 1), enumerate database tables (Checkpoint 2), and extract the master key from the secret table (Final Solve).

CHECKPOINTS:
- Checkpoint 1 (+50 PTS): Discover Column Count (Proof Token required)
- Checkpoint 2 (+50 PTS): Table Enumeration (Proof Token required)

START HERE:
Test how the search query responds to a single quote (') to induce a SQL syntax error. Then use ORDER BY clauses to determine the exact number of columns returned.`,
      flag: 'techx{un10n_b4s3d_sql1_m4st3r_2026}',
      checkpoints: [
        {
          stepNumber: 1,
          title: 'Step 1: Discover Column Count',
          description: 'Determine the number of returned columns via ORDER BY.',
          pointValue: 50,
          proof: 'proof_step1_extract_columns',
        },
        {
          stepNumber: 2,
          title: 'Step 2: Table Enumeration',
          description: 'Extract table names from information_schema.',
          pointValue: 50,
          proof: 'proof_step2_enum_tables',
        },
      ],
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: Use SQL line comments (--) to cut off the rest of the backend query. Try injecting \' ORDER BY 1--, \' ORDER BY 2--, etc., until an error occurs to find the column count.',
          penaltyPoints: 20,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: Checkpoint 1 proof is proof_step1_extract_columns. For Checkpoint 2, inject \' UNION SELECT 1, table_name, 3 FROM information_schema.tables WHERE table_schema=database()-- to find table names (proof_step2_enum_tables).',
          penaltyPoints: 30,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Extract the master key from the secret_keys table using \' UNION SELECT 1, master_key, 3 FROM secret_keys-- to obtain the final flag.',
          penaltyPoints: 40,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 4. Intro SQLi Sandbox (Web, Intermediate, 175 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'intro-sqli-sandbox',
      title: 'Intro SQLi Sandbox',
      category: 'web',
      difficulty: 'intermediate',
      points: 175,
      author: 'TechX Security Team',
      story: 'A junior developer created a simplified user authentication and lookup terminal. The login query uses unsafe string interpolation.',
      description: `STORY:
A junior developer created a simplified user authentication and lookup terminal. The login query uses unsafe string interpolation.

OBJECTIVE:
Learn how authentication bypass works in SQL injection by crafting a payload that forces the authentication query to evaluate to TRUE.

WHAT YOU HAVE ACCESS TO:
Interactive Terminal: /api/v1/challenges/sandbox/sqli-login

START HERE:
Visit the login sandbox at /api/v1/challenges/sandbox/sqli-login. Enter a single quote in the username field to test if input is sanitized.`,
      flag: 'techx{sql1_l0g1n_byp4ss_succ3ssful_2026}',
      connectionInfo: '/api/v1/challenges/sandbox/sqli-login',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: A classic SQL authentication query looks like SELECT * FROM users WHERE username = \'USER\' AND password = \'PASS\'. What happens if your username contains a single quote?',
          penaltyPoints: 15,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: In SQL logic, OR \'1\'=\'1\' makes the condition true regardless of username or password. Comment out the password check using SQL comment markers (--).',
          penaltyPoints: 25,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Enter \' OR 1=1-- into the username field and submit any password. The query executes as WHERE username = \'\' OR 1=1--... and logs you in as administrator, revealing the flag.',
          penaltyPoints: 35,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 5. Isolated Enclave (Web, Expert, 450 pts) — EXPERT #1
    // -------------------------------------------------------------------------
    {
      slug: 'dyn-cloud-sandbox',
      title: 'Isolated Enclave',
      category: 'web',
      difficulty: 'expert',
      points: 450,
      author: 'CloudSec',
      story: 'An isolated high-security container sandbox is spun up on demand per team. The microservice runs on a restricted container network with strict resource quotas, read-only root filesystem, and network egress controls.',
      description: `STORY:
An isolated high-security container sandbox is spun up on demand per team. The microservice runs on a restricted container network with strict resource quotas, read-only root filesystem, and network egress controls.

OBJECTIVE:
Start your team's dedicated sandbox instance via the platform, analyze the running service, and discover the runtime container escape secret.

START HERE:
Launch your team's container instance using the challenge launcher. Connect to the provided proxy URL and inspect the running environment headers, configuration, and runtime variables.`,
      flag: 'techx{dyn_c0nt41n3r_3sc4p3_succ3ss}',
      connectionInfo: 'Dedicated Dynamic Sandbox (Provision via Instance Launcher)',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: Analyze the HTTP headers and internal proxy route assigned to your team container. The container environment contains metadata and runtime state.',
          penaltyPoints: 35,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: Examine the application\'s configuration endpoints and environment inspection mechanisms. Look for how secrets are injected at container startup.',
          penaltyPoints: 50,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Correlate the container entrypoint parameters and process environment block to extract the dynamic runtime flag.',
          penaltyPoints: 75,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 6. Source Trace (Web, Beginner, 50 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'web-source-trace',
      title: 'Source Trace',
      category: 'web',
      difficulty: 'beginner',
      points: 50,
      author: 'CyberCadet',
      story: 'A rogue contractor built a landing portal for the syndicate. Before publishing, they left developer comments and hidden elements in the HTML markup.',
      description: `STORY:
A rogue contractor built a landing portal for the syndicate. Before publishing, they left developer comments and hidden elements in the HTML markup.

OBJECTIVE:
View the page source, inspect the DOM tree, and retrieve the hidden verification token.

WHAT YOU HAVE ACCESS TO:
Target Webpage: /api/v1/challenges/sandbox/source-trace

START HERE:
Open the target URL /api/v1/challenges/sandbox/source-trace in your web browser. Right-click anywhere on the page and select "View Page Source" (or press Ctrl+U).`,
      flag: 'techx{cl13nt_s1d3_s0urc3_1nsp3ct10n_ftw}',
      connectionInfo: '/api/v1/challenges/sandbox/source-trace',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: Web browsers receive raw HTML code from web servers. HTML comments begin with <!-- and end with -->. Look for hidden comments in the page source.',
          penaltyPoints: 10,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: Press Ctrl+F in the page source viewer and search for techx{ or TODO or SECRET.',
          penaltyPoints: 15,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: In the HTML source near the bottom footer, look inside the comment: <!-- SECRET_DEVELOPER_KEY: techx{cl13nt_s1d3_s0urc3_1nsp3ct10n_ftw} -->.',
          penaltyPoints: 20,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 7. Robots Don't Lie (Web, Beginner, 60 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'web-robots-txt',
      title: 'Robots Don\'t Lie',
      category: 'web',
      difficulty: 'beginner',
      points: 60,
      author: 'WebScout',
      story: 'Web crawlers follow a file called robots.txt to know which paths they should not index. Often, web developers put sensitive administrative directories in robots.txt thinking it keeps them secret!',
      description: `STORY:
Web crawlers follow a file called robots.txt to know which paths they should not index. Often, web developers put sensitive administrative directories in robots.txt thinking it keeps them secret!

OBJECTIVE:
Inspect the website\'s robots.txt file, find the disallowed secret directory, and navigate to it to recover the flag.

WHAT YOU HAVE ACCESS TO:
Target Webpage: /api/v1/challenges/sandbox/robots-site

START HERE:
Open /api/v1/challenges/sandbox/robots-site in your browser. Append /robots.txt to the URL.`,
      flag: 'techx{r0b0ts_txt_1s_n0t_4cc3ss_c0ntr0l_2026}',
      connectionInfo: '/api/v1/challenges/sandbox/robots-site',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: The Robots Exclusion Standard lives at /robots.txt in the root of web applications. Visit /api/v1/challenges/sandbox/robots-site/robots.txt in your browser.',
          penaltyPoints: 10,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: Look at the Disallow: directive inside robots.txt. It points to a hidden path that the webmaster wanted search engines to avoid.',
          penaltyPoints: 15,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Navigate directly to the disallowed path: /api/v1/challenges/sandbox/robots-site/syndicate-secret-vault-7718/ in your browser to view the flag.',
          penaltyPoints: 20,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 8. Base64 Break (Crypto, Beginner, 60 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'crypto-base64-break',
      title: 'Base64 Break',
      category: 'crypto',
      difficulty: 'beginner',
      points: 60,
      author: 'CipherNovice',
      story: 'An automated interceptor captured a transmission from an internal sensor node. The message consists of alphanumeric text ending with = padding characters, indicating standard data encoding.',
      description: `STORY:
An automated interceptor captured a transmission from an internal sensor node. The message consists of alphanumeric text ending with = padding characters, indicating standard data encoding.

OBJECTIVE:
Decode the message to recover the original sensor beacon text and flag.

ENCODED TRANSMISSION:
dGVjaHh7YjF0c19hbmRfYnl0ZXNfYjRzZTY0X2RlYzBkZWR9

START HERE:
Look at the character set and padding: uppercase, lowercase, numbers, and trailing =. This is the signature of Base64 encoding. Use a terminal or online decoder to decode it.`,
      flag: 'techx{b1ts_and_bytes_b4se64_dec0ded}',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: Base64 represents binary data in an ASCII string format using 64 characters (A-Z, a-z, 0-9, +, /) with = padding.',
          penaltyPoints: 10,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: In Linux/macOS terminal run echo "dGVjaHh..." | base64 -d, in PowerShell run [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("dGVjaHh...")), or use CyberChef.',
          penaltyPoints: 15,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Decoding dGVjaHh7YjF0c19hbmRfYnl0ZXNfYjRzZTY0X2RlYzBkZWR9 directly produces the flag: techx{b1ts_and_bytes_b4se64_dec0ded}.',
          penaltyPoints: 20,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 9. Hex Hunt (Crypto, Beginner, 75 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'crypto-hex-hunt',
      title: 'Hex Hunt',
      category: 'crypto',
      difficulty: 'beginner',
      points: 75,
      author: 'BitMaster',
      story: 'A hardware debugger dumped raw memory bytes from a micro-controller after a secure firmware update. The engineer left an encrypted debug token in hexadecimal format.',
      description: `STORY:
A hardware debugger dumped raw memory bytes from a micro-controller after a secure firmware update. The engineer left an encrypted debug token in hexadecimal format.

OBJECTIVE:
Convert the hexadecimal memory dump into readable ASCII characters to retrieve the debug flag.

RAW HEXADECIMAL DUMP:
74656368787b68337834643363316d346c5f7472346e736c347431306e5f6630756e647d

START HERE:
Each pair of hexadecimal characters represents one byte (8 bits). For example, 74 is the ASCII code for letter 't', and 65 is 'e'. Convert the full stream from hex to text.`,
      flag: 'techx{h3x4d3c1m4l_tr4nsl4t10n_f0und}',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: In hexadecimal, characters 0-9 and a-f represent values 0-15. Two hex characters equal one byte.',
          penaltyPoints: 10,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: In Python, run bytes.fromhex("74656368...").decode(). Or in CyberChef, drag the "From Hex" recipe into the recipe box.',
          penaltyPoints: 15,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Decoding the hex stream gives the ASCII text techx{h3x4d3c1m4l_tr4nsl4t10n_f0und}.',
          penaltyPoints: 20,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 10. XOR 101 (Crypto, Beginner, 75 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'crypto-xor-101',
      title: 'XOR 101',
      category: 'crypto',
      difficulty: 'beginner',
      points: 75,
      author: 'Cryptix',
      story: 'A beginner spy encrypted their secret diary entry using a single-byte XOR cipher with key 0x42 (\'B\' in ASCII).',
      description: `STORY:
A beginner spy encrypted their secret diary entry using a single-byte XOR cipher with key 0x42 ('B' in ASCII).

OBJECTIVE:
Apply the single-byte XOR operation using key 0x42 across the intercepted ciphertext to decrypt the message.

CIPHERTEXT (HEXADECIMAL):
3627212a3a393a72301d31732c252e711d203b36711d29713b1d27383f

START HERE:
Each byte of the original flag was XORed with the single byte 0x42. Because XOR is self-inverse (C ^ K = P), XORing each byte of ciphertext with 0x42 again will restore the plaintext!`,
      flag: 'techx{x0r_s1ngl3_byt3_k3y_ez}',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: In XOR encryption, decrypting is the exact same operation as encrypting. XOR each byte of the hex string with 0x42.',
          penaltyPoints: 10,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: In CyberChef, load the hex string, add "From Hex", then add the "XOR" recipe with Key 42 (Type: Hex).',
          penaltyPoints: 15,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: In Python: bytes([b ^ 0x42 for b in bytes.fromhex("3627212a3a393a72301d31732c252e711d203b36711d29713b1d27383f")]).decode() yields the flag.',
          penaltyPoints: 20,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 11. Metadata Mystery (Forensics, Beginner, 80 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'forensics-metadata-mystery',
      title: 'Metadata Mystery',
      category: 'forensics',
      difficulty: 'beginner',
      points: 80,
      author: 'TraceFinder',
      story: 'Security officers intercepted an evidence image photographed by a suspect. While the picture looks normal, digital cameras and editing tools embed hidden metadata (EXIF) tags such as Artist, Copyright, or Comments.',
      description: `STORY:
Security officers intercepted an evidence image photographed by a suspect. While the picture looks normal, digital cameras and editing tools embed hidden metadata (EXIF) tags such as Artist, Copyright, or Comments.

OBJECTIVE:
Download evidence_photo.jpg and inspect its EXIF metadata tags to find the secret tag value.

WHAT YOU HAVE ACCESS TO:
File Attachment: evidence_photo.jpg (attached below)

START HERE:
Download the attachment evidence_photo.jpg. Right-click the file in Windows and select Properties -> Details, or use a tool like exiftool / strings / an online EXIF viewer.`,
      flag: 'techx{3x1f_m3t4d4t4_h1dd3n_1n_pl41n_s1ght}',
      file: 'evidence_photo.jpg',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: Image files (JPEG, PNG, TIFF) store extra information such as camera model, date taken, author, and comments in EXIF headers.',
          penaltyPoints: 10,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: You can run strings evidence_photo.jpg | grep techx or inspect the file properties in Windows / Linux / macOS.',
          penaltyPoints: 15,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: The XPComment / Author property contains the flag: techx{3x1f_m3t4d4t4_h1dd3n_1n_pl41n_s1ght}.',
          penaltyPoints: 20,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 12. Lost Password (Forensics, Beginner, 85 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'forensics-lost-password',
      title: 'Lost Password',
      category: 'forensics',
      difficulty: 'beginner',
      points: 85,
      author: 'SecAudit',
      story: 'An administrator accidentally pushed an internal deployment configuration file and environment dump to a public share. The file contains dozens of simulated configurations, but also an active API secret token.',
      description: `STORY:
An administrator accidentally pushed an internal deployment configuration file and environment dump to a public share. The file contains dozens of simulated configurations, but also an active API secret token.

OBJECTIVE:
Download server_deploy.env and search through the configuration variables for the exposed administrative credentials.

WHAT YOU HAVE ACCESS TO:
File Attachment: server_deploy.env (attached below)

START HERE:
Download server_deploy.env and open it in a text editor (Notepad, VS Code, or nano). Search for keywords like SECRET, PASSWORD, or FLAG.`,
      flag: 'techx{3nv_v4rs_sh0uld_n3v3r_b3_c0mm1tt3d}',
      file: 'server_deploy.env',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: Look through the lines defining environment variables. Many are normal settings like PORT=8080, DB_POOL=10.',
          penaltyPoints: 10,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: Use the search feature (Ctrl+F) to search for TECHX or ADMIN_BACKUP or ENCRYPTION.',
          penaltyPoints: 15,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Check the variable ADMIN_BACKUP_ENCRYPTION_KEY: it holds the flag techx{3nv_v4rs_sh0uld_n3v3r_b3_c0mm1tt3d}.',
          penaltyPoints: 20,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 13. Cookie Trail (Web, Beginner, 90 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'web-cookie-trail',
      title: 'Cookie Trail',
      category: 'web',
      difficulty: 'beginner',
      points: 90,
      author: 'ByteBaker',
      story: 'A cookie-based session management system on the syndicate portal stores client profile preferences in a browser cookie. Analysts noticed the cookie holds encoded authorization data.',
      description: `STORY:
A cookie-based session management system on the syndicate portal stores client profile preferences in a browser cookie. Analysts noticed the cookie holds encoded authorization data.

OBJECTIVE:
Inspect your browser\'s cookies when visiting the portal, analyze the cookie value, and modify it to gain administrative status.

WHAT YOU HAVE ACCESS TO:
Target Webpage: /api/v1/challenges/sandbox/cookie-trail

START HERE:
Navigate to /api/v1/challenges/sandbox/cookie-trail. Open Developer Tools (F12) -> Application (or Storage) tab -> Cookies. Look at the cookie named session_auth.`,
      flag: 'techx{c00k13_m4n1pul4t10n_3l3v4t10n_2026}',
      connectionInfo: '/api/v1/challenges/sandbox/cookie-trail',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: The cookie session_auth contains a Base64-encoded string such as eyJyb2xlIjoidmlzaXRvciJ9 (which decodes to {"role":"visitor"}).',
          penaltyPoints: 10,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: What happens if you change visitor to admin in the JSON object, re-encode it to Base64 (eyJyb2xlIjoiYWRtaW4ifQ==), and update the cookie in your browser?',
          penaltyPoints: 20,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Set the session_auth cookie value to eyJyb2xlIjoiYWRtaW4ifQ== and refresh the page. The server verifies the admin role and renders the flag.',
          penaltyPoints: 30,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 14. Header Hunt (Web, Beginner, 90 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'web-header-hunt',
      title: 'Header Hunt',
      category: 'web',
      difficulty: 'beginner',
      points: 90,
      author: 'NetPacket',
      story: 'A covert communications server sends special routing and provenance instructions inside custom HTTP response headers rather than the HTML body.',
      description: `STORY:
A covert communications server sends special routing and provenance instructions inside custom HTTP response headers rather than the HTML body.

OBJECTIVE:
Send a web request to the target endpoint and inspect the HTTP response headers returned by the server.

WHAT YOU HAVE ACCESS TO:
Target Endpoint: /api/v1/challenges/sandbox/header-hunt

START HERE:
Open your browser\'s Developer Tools -> Network tab, or use curl -I / PowerShell Invoke-WebRequest. Request /api/v1/challenges/sandbox/header-hunt and inspect the response headers.`,
      flag: 'techx{http_r3sp0ns3_h34d3rs_r3v34l_s3cr3ts}',
      connectionInfo: '/api/v1/challenges/sandbox/header-hunt',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: HTTP responses contain headers like Content-Type, Date, and custom headers prefixed with X-.',
          penaltyPoints: 10,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: In terminal, run: curl.exe -i http://localhost/api/v1/challenges/sandbox/header-hunt and look at the lines before the JSON response body.',
          penaltyPoints: 20,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Look for the custom header X-TechX-Secret-Transmission: it contains the flag techx{http_r3sp0ns3_h34d3rs_r3v34l_s3cr3ts}.',
          penaltyPoints: 30,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 15. Simple IDOR (Web, Beginner, 100 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'web-simple-idor',
      title: 'Simple IDOR',
      category: 'web',
      difficulty: 'beginner',
      points: 100,
      author: 'VulnHunter',
      story: 'An employee directory allows employees to view their profile by specifying an ID number in the URL: /profile?id=101. However, access controls are not enforced between different user IDs!',
      description: `STORY:
An employee directory allows employees to view their profile by specifying an ID number in the URL: /profile?id=101. However, access controls are not enforced between different user IDs!

OBJECTIVE:
Find the profile belonging to the Chief Security Officer (User ID 1) by manipulating the ID parameter.

WHAT YOU HAVE ACCESS TO:
Target Webpage: /api/v1/challenges/sandbox/simple-idor?id=101

START HERE:
Open /api/v1/challenges/sandbox/simple-idor?id=101. Notice how your user profile ID is in the URL. What happens if you request a different ID?`,
      flag: 'techx{1d0r_d1r3ct_0bj3ct_r3f3r3nc3_byp4ss}',
      connectionInfo: '/api/v1/challenges/sandbox/simple-idor?id=101',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: IDOR (Insecure Direct Object Reference) occurs when an application exposes a reference to an internal object (like user ID) without validating permissions.',
          penaltyPoints: 10,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: If standard users start at ID 101, where are the system founders or top administrators typically stored? Try smaller numeric IDs.',
          penaltyPoints: 20,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Navigate to /api/v1/challenges/sandbox/simple-idor?id=1 in your browser. The profile for "Chief Security Officer" will render with the secret flag.',
          penaltyPoints: 30,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 16. Log Detective (Forensics, Beginner, 110 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'forensics-log-detective',
      title: 'Log Detective',
      category: 'forensics',
      difficulty: 'beginner',
      points: 110,
      author: 'SOCAnalyst',
      story: 'A Security Operations Center (SOC) detected a brute force attack followed by a successful unauthorized SSH access. A raw log archive containing 1,200 authentication events was captured.',
      description: `STORY:
A Security Operations Center (SOC) detected a brute force attack followed by a successful unauthorized SSH access. A raw log archive containing 1,200 authentication events was captured.

OBJECTIVE:
Download auth_audit.log, filter for successful logins from the malicious IP address, and find the flag passed in the session identifier.

WHAT YOU HAVE ACCESS TO:
File Attachment: auth_audit.log (attached below)

START HERE:
Download auth_audit.log. Use grep or text search to find lines containing "Accepted password" or "FLAG" or "techx".`,
      flag: 'techx{gr3p_1s_4_s0c_4n4lyst_b3st_fr13nd}',
      file: 'auth_audit.log',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: Attackers generate many "Failed password" lines before a single "Accepted password". Filter out failures to find the successful login.',
          penaltyPoints: 15,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: Run grep "Accepted" auth_audit.log or search for "Accepted password for root".',
          penaltyPoints: 25,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: The accepted session log contains the session token session_key=techx{gr3p_1s_4_s0c_4n4lyst_b3st_fr13nd}.',
          penaltyPoints: 35,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 17. PCAP Starter (Network, Beginner, 110 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'network-pcap-starter',
      title: 'PCAP Starter',
      category: 'network',
      difficulty: 'beginner',
      points: 110,
      author: 'WireSharker',
      story: 'An unencrypted network packet capture was recorded from an internal LAN segment where an automated agent transmitted an urgent operational dispatch over HTTP.',
      description: `STORY:
An unencrypted network packet capture was recorded from an internal LAN segment where an automated agent transmitted an urgent operational dispatch over HTTP.

OBJECTIVE:
Download network_traffic.pcap, open it in Wireshark or tcpdump/strings, and locate the secret flag transmitted in the plaintext HTTP payload.

WHAT YOU HAVE ACCESS TO:
File Attachment: network_traffic.pcap (attached below)

START HERE:
Download network_traffic.pcap. Open the file in Wireshark, or use the strings command if you do not have Wireshark installed.`,
      flag: 'techx{w1r3sh4rk_f0ll0w_tcp_str34m_2026}',
      file: 'network_traffic.pcap',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: In Wireshark, look for HTTP packets (protocol filter: http). Plaintext HTTP sends data without encryption.',
          penaltyPoints: 15,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: Right-click any HTTP packet and select "Follow" -> "TCP Stream". This displays the full request and response exchange in readable text.',
          penaltyPoints: 25,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: In the HTTP POST request to /api/v1/dispatch, the JSON body contains: {"status":"active","flag":"techx{w1r3sh4rk_f0ll0w_tcp_str34m_2026}"}.',
          penaltyPoints: 35,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 18. Image in Plain Sight (Forensics, Beginner, 115 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'forensics-stego-image',
      title: 'Image in Plain Sight',
      category: 'forensics',
      difficulty: 'beginner',
      points: 115,
      author: 'PixelGuard',
      story: 'An agent smuggled an operational order disguised as a digital banner graphic. Simple steganography techniques often append extra data to the end of an image file after the standard EOF (End of File) marker.',
      description: `STORY:
An agent smuggled an operational order disguised as a digital banner graphic. Simple steganography techniques often append extra data to the end of an image file after the standard EOF (End of File) marker.

OBJECTIVE:
Download covert_banner.png and extract the hidden ASCII payload hidden beyond the image structure.

WHAT YOU HAVE ACCESS TO:
File Attachment: covert_banner.png (attached below)

START HERE:
Download covert_banner.png. Image viewers only render pixels up to the PNG IEND chunk. Any data appended after the end of the image is invisible on screen, but can be viewed with a text reader or strings.`,
      flag: 'techx{st3g0_str1ngs_h1dd3n_1n_pl41n_s1ght}',
      file: 'covert_banner.png',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: Use the strings utility or a hex editor (or open the file in VS Code/Notepad) to inspect readable text inside the binary image file.',
          penaltyPoints: 15,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: Run strings covert_banner.png | grep techx or scroll to the very end of the file in a hex viewer.',
          penaltyPoints: 25,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: At the bottom of the file following the PNG structure, the appended string is: techx{st3g0_str1ngs_h1dd3n_1n_pl41n_s1ght}.',
          penaltyPoints: 35,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 19. API Discovery (Web, Intermediate, 140 pts)
    // -------------------------------------------------------------------------
    {
      slug: 'web-api-discovery',
      title: 'API Discovery',
      category: 'web',
      difficulty: 'intermediate',
      points: 140,
      author: 'EndpointExplorer',
      story: 'An internal API gateway exposes a public status endpoint. Security analysts suspect the gateway documentation and schema definitions leak unlisted administrative API endpoints.',
      description: `STORY:
An internal API gateway exposes a public status endpoint. Security analysts suspect the gateway documentation and schema definitions leak unlisted administrative API endpoints.

OBJECTIVE:
Explore the API structure, discover the hidden management endpoint, and query it to extract the system flag.

WHAT YOU HAVE ACCESS TO:
Target Endpoint: /api/v1/challenges/sandbox/api-explorer/status

START HERE:
Query /api/v1/challenges/sandbox/api-explorer/status. Look at the JSON response fields: does it link to documentation, versioning, or schema routes?`,
      flag: 'techx{4p1_3ndp01nt_3num3r4t10n_succ3ss_2026}',
      connectionInfo: '/api/v1/challenges/sandbox/api-explorer/status',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: The status endpoint includes a documentation_url field. Follow the link to inspect the API docs.',
          penaltyPoints: 20,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: Visit /api/v1/challenges/sandbox/api-explorer/docs. It reveals an undocumented internal endpoint: /api/v1/challenges/sandbox/api-explorer/internal/vault.',
          penaltyPoints: 30,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Make a GET request to /api/v1/challenges/sandbox/api-explorer/internal/vault to retrieve the secret flag.',
          penaltyPoints: 40,
        },
      ],
    },

    // -------------------------------------------------------------------------
    // 20. The Citadel Keygen (Reverse Engineering, Expert, 450 pts) — EXPERT #2
    // -------------------------------------------------------------------------
    {
      slug: 'rev-vault-matrix',
      title: 'The Citadel Keygen',
      category: 'rev',
      difficulty: 'expert',
      points: 450,
      author: 'MatrixReverser',
      story: 'The syndicate protects their core mainframe with a proprietary license key validation algorithm known as the Citadel Matrix. The script performs complex modular affine matrix constraints on candidate keys.',
      description: `STORY:
The syndicate protects their core mainframe with a proprietary license key validation algorithm known as the Citadel Matrix. The script performs complex modular affine matrix constraints on candidate keys.

OBJECTIVE:
Download the validation binary citadel_validator.py, reverse the verification constraints, calculate the unique valid key for the challenge license ID, and submit the flag.

WHAT YOU HAVE ACCESS TO:
File Attachment: citadel_validator.py (attached below)

START HERE:
Download citadel_validator.py. Examine the verify_key() function: it splits the key into 4-byte blocks, applies an invertible linear transformation modulo 256, and checks against target constraint values.`,
      flag: 'techx{m4tr1x_tr4nsf0rm_r3v3rs3d_k3y_26}',
      file: 'citadel_validator.py',
      hints: [
        {
          orderNumber: 1,
          content: 'HINT 1 — START HERE: Analyze the modular matrix multiplication applied in the verification loop. The linear transformation is non-singular under modulo 256 (det = 49).',
          penaltyPoints: 35,
        },
        {
          orderNumber: 2,
          content: 'HINT 2 — THINK ABOUT THIS: Compute the modular inverse of the 4x4 transformation matrix (or set up a Z3 / sympy constraint solver on the system of linear equations).',
          penaltyPoints: 50,
        },
        {
          orderNumber: 3,
          content: 'HINT 3 — STRONGER DIRECTION: Inverting the linear transform against the target constant vector [162, 93, 63, 39, 99, 17, 80, 228...] yields the ASCII characters for the flag: techx{m4tr1x_tr4nsf0rm_r3v3rs3d_k3y_26}.',
          penaltyPoints: 75,
        },
      ],
    },
  ];

  logger.info(`Seeding ${challengeDefinitions.length} challenges into database...`);

  for (const def of challengeDefinitions) {
    const categoryId = catMap.get(def.category);
    if (!categoryId) {
      throw new Error(`Category ${def.category} not found for challenge ${def.slug}`);
    }

    const [chal] = await db
      .insert(challenges)
      .values({
        categoryId,
        slug: def.slug,
        title: def.title,
        description: def.description,
        story: def.story,
        difficulty: def.difficulty,
        points: def.points,
        flagHash: hashFlag(def.flag),
        isDynamicHmac: false,
        status: 'published',
        releaseTime: compStart,
        author: def.author,
        connectionInfo: def.connectionInfo || null,
      })
      .onConflictDoUpdate({
        target: challenges.slug,
        set: {
          categoryId,
          title: def.title,
          description: def.description,
          story: def.story,
          difficulty: def.difficulty,
          points: def.points,
          flagHash: hashFlag(def.flag),
          isDynamicHmac: false,
          status: 'published',
          releaseTime: compStart,
          author: def.author,
          connectionInfo: def.connectionInfo || null,
        },
      })
      .returning();

    // 4. Attach File if specified
    if (def.file) {
      const meta = getFileMeta(def.file);
      await db.delete(challengeFiles).where(eq(challengeFiles.challengeId, chal.id));
      await db
        .insert(challengeFiles)
        .values({
          challengeId: chal.id,
          filename: def.file,
          filePath: meta.filePath,
          fileSizeBytes: meta.size,
          sha256Checksum: meta.checksum,
          isProtected: false,
        });
    }

    // 5. Attach Checkpoints if specified
    if (def.checkpoints && def.checkpoints.length > 0) {
      for (const cp of def.checkpoints) {
        await db
          .insert(checkpoints)
          .values({
            challengeId: chal.id,
            stepNumber: cp.stepNumber,
            title: cp.title,
            description: cp.description,
            pointValue: cp.pointValue,
            validationType: 'token_proof',
            secretProofHash: hashFlag(cp.proof),
          })
          .onConflictDoUpdate({
            target: [checkpoints.challengeId, checkpoints.stepNumber],
            set: {
              title: cp.title,
              description: cp.description,
              pointValue: cp.pointValue,
              secretProofHash: hashFlag(cp.proof),
            },
          });
      }
    }

    // 6. Attach Hints cleanly
    if (def.hints && def.hints.length > 0) {
      await db.delete(hints).where(eq(hints.challengeId, chal.id));
      for (const h of def.hints) {
        await db
          .insert(hints)
          .values({
            challengeId: chal.id,
            orderNumber: h.orderNumber,
            content: h.content,
            penaltyPoints: h.penaltyPoints,
          });
      }
    }
  }

  logger.info(`✓ Successfully seeded all ${challengeDefinitions.length} official challenges!`);
  logger.info(`✓ 18 Accessible Challenges (50-200 pts) + 2 Hardened Expert Challenges (450 pts) configured.`);
  logger.info(`✓ All 3-tier progressive hints, checkpoints, and static attachments verified.`);
}

if (process.argv[1]?.includes('seed_staging_event')) {
  seedStagingEvent()
    .then(() => {
      logger.info('Staging seed completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Staging seed failed');
      process.exit(1);
    });
}
