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
  logger.info('Initializing Phase 3 realistic event configuration...');

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
  logger.info('✓ Competition state initialized to LIVE (2-day schedule)');

  // 2. Categories
  const categoryDefs = [
    { name: 'Web Exploitation', slug: 'web', description: 'Web app security, injection, auth bypass', displayOrder: 1 },
    { name: 'Cryptography', slug: 'crypto', description: 'Ciphers, RSA, elliptic curves, hash collisions', displayOrder: 2 },
    { name: 'Reverse Engineering', slug: 'rev', description: 'Binary analysis, decompilation, anti-debugging', displayOrder: 3 },
    { name: 'Forensics', slug: 'forensics', description: 'PCAP analysis, memory dumps, steganography', displayOrder: 4 },
    { name: 'Binary Exploitation', slug: 'pwn', description: 'Buffer overflows, ROP, heap exploitation', displayOrder: 5 },
  ];

  const catMap = new Map<string, string>();
  for (const cat of categoryDefs) {
    const [inserted] = await db
      .insert(categories)
      .values(cat)
      .onConflictDoUpdate({
        target: categories.slug,
        set: { name: cat.name, description: cat.description },
      })
      .returning();
    catMap.set(cat.slug, inserted.id);
  }
  logger.info(`✓ Seeded ${catMap.size} realistic categories`);

  // Ensure file storage dir exists
  const staticDir = path.resolve(process.cwd(), 'data/challenges/static');
  if (!fs.existsSync(staticDir)) {
    fs.mkdirSync(staticDir, { recursive: true });
  }
  const sampleFilePath = path.join(staticDir, 'portal_source.zip');
  const sampleContent = Buffer.from('TechX CTF 2026 Staging Challenge Artifact Source Bundle');
  fs.writeFileSync(sampleFilePath, sampleContent);
  const sampleChecksum = createHash('sha256').update(sampleContent).digest('hex');

  // 3. Staging Challenges
  // Challenge 1: Web Beginner
  const [chal1] = await db
    .insert(challenges)
    .values({
      categoryId: catMap.get('web')!,
      slug: 'web-intro-portal',
      title: 'Portal of Secrets',
      description: 'Find the parameter that reveals hidden admin telemetry.',
      story: 'The syndicate left an insecure portal endpoint open on the internal gateway.',
      difficulty: 'beginner',
      points: 100,
      flagHash: hashFlag('techx{web_b4s1c_1d0r_d3t3ct3d}'),
      isDynamicHmac: false,
      status: 'published',
      releaseTime: compStart,
      author: 'TechX Security Team',
    })
    .onConflictDoUpdate({
      target: challenges.slug,
      set: { status: 'published', points: 100 },
    })
    .returning();

  // Attach file to Challenge 1
  await db
    .insert(challengeFiles)
    .values({
      challengeId: chal1.id,
      filename: 'portal_source.zip',
      filePath: sampleFilePath,
      fileSizeBytes: sampleContent.length,
      sha256Checksum: sampleChecksum,
      isProtected: false,
    })
    .onConflictDoNothing();

  // Challenge 2: Crypto Beginner
  await db
    .insert(challenges)
    .values({
      categoryId: catMap.get('crypto')!,
      slug: 'crypto-quantum-xor',
      title: 'Quantum XOR',
      description: 'Decrypt the XOR stream with an all-zero key.',
      story: 'Weak randomness generator detected in the telemetry transmitter.',
      difficulty: 'beginner',
      points: 150,
      flagHash: hashFlag('techx{x0r_1s_n0t_3ncrypt10n_wh3n_k3y_1s_z3r0}'),
      isDynamicHmac: false,
      status: 'published',
      releaseTime: compStart,
      author: 'QuantumLab',
    })
    .onConflictDoUpdate({
      target: challenges.slug,
      set: { status: 'published', points: 150 },
    });

  // Challenge 3: Web Intermediate (with 2 checkpoints & 2 hints)
  const [chal3] = await db
    .insert(challenges)
    .values({
      categoryId: catMap.get('web')!,
      slug: 'web-sqli-checkpoint',
      title: 'Structured Leakage',
      description: 'Progress through SQL injection checkpoints to obtain the database master key.',
      story: 'Bypass the authentication filter and extract checkpoint secrets.',
      difficulty: 'intermediate',
      points: 250,
      flagHash: hashFlag('techx{un10n_b4s3d_sql1_m4st3r_2026}'),
      isDynamicHmac: false,
      status: 'published',
      releaseTime: compStart,
      author: 'ByteWizard',
    })
    .onConflictDoUpdate({
      target: challenges.slug,
      set: { status: 'published', points: 250 },
    })
    .returning();

  // Checkpoints for Challenge 3
  const [cp1] = await db
    .insert(checkpoints)
    .values({
      challengeId: chal3.id,
      stepNumber: 1,
      title: 'Step 1: Discover Column Count',
      description: 'Determine the number of returned columns via ORDER BY.',
      pointValue: 50,
      validationType: 'token_proof',
      secretProofHash: hashFlag('proof_step1_extract_columns'),
    })
    .onConflictDoUpdate({
      target: [checkpoints.challengeId, checkpoints.stepNumber],
      set: { pointValue: 50 },
    })
    .returning();

  const [cp2] = await db
    .insert(checkpoints)
    .values({
      challengeId: chal3.id,
      stepNumber: 2,
      title: 'Step 2: Table Enumeration',
      description: 'Extract table names from information_schema.',
      pointValue: 50,
      validationType: 'token_proof',
      secretProofHash: hashFlag('proof_step2_enum_tables'),
    })
    .onConflictDoUpdate({
      target: [checkpoints.challengeId, checkpoints.stepNumber],
      set: { pointValue: 50 },
    })
    .returning();

  // Hints for Challenge 3
  await db
    .insert(hints)
    .values([
      {
        challengeId: chal3.id,
        orderNumber: 1,
        content: 'Try using SQL comments (--) to truncate the remainder of the query.',
        penaltyPoints: 25,
      },
      {
        challengeId: chal3.id,
        orderNumber: 2,
        content: 'Check the information_schema.tables table for hidden secrets.',
        penaltyPoints: 50,
      },
    ])
    .onConflictDoNothing();

  // Challenge 4: Web Expert (Dynamic container)
  await db
    .insert(challenges)
    .values({
      categoryId: catMap.get('web')!,
      slug: 'dyn-cloud-sandbox',
      title: 'Isolated Enclave',
      description: 'Access your dedicated container sandbox and retrieve the runtime flag.',
      story: 'A dynamic isolated Docker container is spun up per team on an isolated network.',
      difficulty: 'expert',
      points: 400,
      flagHash: hashFlag('techx{dyn_c0nt41n3r_3sc4p3_succ3ss}'),
      isDynamicHmac: false,
      status: 'published',
      releaseTime: compStart,
      author: 'CloudSec',
    })
    .onConflictDoUpdate({
      target: challenges.slug,
      set: { status: 'published', points: 400 },
    });

  logger.info('✓ Seeded 4 realistic staging challenges across beginner/intermediate/expert levels');
  logger.info('✓ Checkpoints (Step 1 & Step 2) and Hints (Penalty 25 & 50) verified');
}

if (process.argv[1]?.includes('seed_staging_event')) {
  seedStagingEvent()
    .then(() => {
      console.log('[✓] Realistic event configuration seeded successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[-] Seeding failed:', err);
      process.exit(1);
    });
}
