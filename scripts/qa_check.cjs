const fs = require('fs');

const guide = fs.readFileSync('TECHX_CTF_2026_COMPLETE_SOLUTION_GUIDE.md', 'utf8');
const cheatsheet = fs.readFileSync('TECHX_CTF_2026_QUICK_SOLVE_CHEATSHEET.md', 'utf8');

const targetSlugs = [
  'web-source-trace',
  'crypto-base64-break',
  'web-robots-txt',
  'crypto-hex-hunt',
  'crypto-xor-101',
  'forensics-metadata-mystery',
  'forensics-lost-password',
  'web-cookie-trail',
  'web-header-hunt',
  'web-intro-portal',
  'crypto-quantum-xor',
  'web-simple-idor',
  'forensics-log-detective',
  'network-pcap-starter',
  'forensics-stego-image',
  'web-api-discovery',
  'intro-sqli-sandbox',
  'web-sqli-checkpoint',
  'dyn-cloud-sandbox',
  'rev-vault-matrix'
];

console.log('--- QA CHECK 1: Challenge Coverage ---');
let missingGuide = targetSlugs.filter(s => !guide.includes(s));
let missingCheat = targetSlugs.filter(s => !cheatsheet.includes(s));
console.log('Missing in Guide:', missingGuide);
console.log('Missing in Cheatsheet:', missingCheat);

console.log('\n--- QA CHECK 2: Placeholders & Fabrications ---');
const suspicious = ['TODO', 'TBD', 'PLACEHOLDER', 'FIXME', 'xxx-flag', 'fake{'];
suspicious.forEach(word => {
  const gMatch = guide.toLowerCase().includes(word.toLowerCase());
  const cMatch = cheatsheet.toLowerCase().includes(word.toLowerCase());
  if (gMatch || cMatch) {
    console.warn('Found suspicious token:', word, 'Guide:', gMatch, 'Cheat:', cMatch);
  } else {
    console.log('Clean of:', word);
  }
});

console.log('\n--- QA CHECK 3: Required Sections in Guide ---');
const requiredSections = [
  '**Metadata**',
  '**1. Challenge objective**',
  '**2. Prerequisites**',
  '**3. Exact step-by-step solution**',
  '**4. Flag discovery**',
  '**5. Submission**',
  '**6. Hints and checkpoints**',
  '**7. Common failures and troubleshooting**',
  '**8. Verification evidence**'
];
requiredSections.forEach(sec => {
  let count = 0;
  let pos = 0;
  while ((pos = guide.indexOf(sec, pos)) !== -1) {
    count++;
    pos += sec.length;
  }
  console.log(sec, 'count:', count, '(Expected: 20)');
});

console.log('\n--- QA CHECK 4: Required Fields in Cheatsheet ---');
const cheatFields = [
  '1. **Challenge Name & Slug:**',
  '2. **Required File / Service:**',
  '3. **Exact Shortest Verified Sequence of Commands / Actions:**',
  '4. **Exact Verified Payload:**',
  '5. **Expected Result:**',
  '6. **How to Identify / Derive Flag:**',
  '7. **Team-Specific / Checkpoint Requirement:**',
  '8. **Reference to Complete Solution Guide:**',
  '9. **Verification Status:**'
];
cheatFields.forEach(field => {
  let count = 0;
  let pos = 0;
  while ((pos = cheatsheet.indexOf(field, pos)) !== -1) {
    count++;
    pos += field.length;
  }
  console.log(field, 'count:', count, '(Expected: 20)');
});

console.log('\n--- QA CHECK 5: Verification Status Integrity ---');
const verifiedGuideCount = (guide.match(/\*\*Status:\*\*\s*\*\*VERIFIED\*\*|\*\*Verification Status:\*\*\s*\*\*VERIFIED\*\*/g) || []).length;
console.log('Guide VERIFIED count:', verifiedGuideCount);

const verifiedCheatCount = (cheatsheet.match(/\*\*Verification Status:\*\*\s*\*\*VERIFIED\*\*/g) || []).length;
console.log('Cheatsheet VERIFIED count:', verifiedCheatCount);
