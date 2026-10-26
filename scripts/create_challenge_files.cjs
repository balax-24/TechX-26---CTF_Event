const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const staticDir = path.resolve(__dirname, '../data/challenges/static');
if (!fs.existsSync(staticDir)) {
  fs.mkdirSync(staticDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// 1. ZIP CREATOR UTILITY
// ---------------------------------------------------------------------------
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipArchive(files, outputPath) {
  const fileRecords = [];
  let offset = 0;
  const chunks = [];

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const dataBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    
    const crc = crc32(dataBuf);
    const uncompressedSize = dataBuf.length;
    const compressedData = zlib.deflateRawSync(dataBuf);
    const compressedSize = compressedData.length;
    const compressionMethod = 8; // DEFLATE

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(0x4000, 10);
    localHeader.writeUInt16LE(0x5ca5, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    fileRecords.push({
      nameBuf,
      crc,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      offset,
    });

    chunks.push(localHeader);
    chunks.push(compressedData);
    offset += localHeader.length + compressedData.length;
  }

  const cdOffset = offset;
  let cdSize = 0;

  for (const rec of fileRecords) {
    const cdHeader = Buffer.alloc(46 + rec.nameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(0, 8);
    cdHeader.writeUInt16LE(rec.compressionMethod, 10);
    cdHeader.writeUInt16LE(0x4000, 12);
    cdHeader.writeUInt16LE(0x5ca5, 14);
    cdHeader.writeUInt32LE(rec.crc, 16);
    cdHeader.writeUInt32LE(rec.compressedSize, 20);
    cdHeader.writeUInt32LE(rec.uncompressedSize, 24);
    cdHeader.writeUInt16LE(rec.nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    cdHeader.writeUInt32LE(0, 38);
    cdHeader.writeUInt32LE(rec.offset, 42);
    rec.nameBuf.copy(cdHeader, 46);

    chunks.push(cdHeader);
    cdSize += cdHeader.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(fileRecords.length, 8);
  eocd.writeUInt16LE(fileRecords.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  chunks.push(eocd);
  const finalZip = Buffer.concat(chunks);
  fs.writeFileSync(outputPath, finalZip);
  return finalZip;
}

// ---------------------------------------------------------------------------
// 2. GENERATE ALL 7 STATIC CHALLENGE ARTIFACTS
// ---------------------------------------------------------------------------

// A. portal_source.zip (Challenge 1: Portal of Secrets)
const portalFiles = [
  {
    name: 'index.html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Syndicate Gateway Admin Portal</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <h1>Internal Gateway Control Plane</h1>
    <div id="status">Connecting to internal telemetry service...</div>
  </div>
  <script src="portal.js"></script>
</body>
</html>`
  },
  {
    name: 'portal.js',
    content: `// TechX CTF 2026 - Syndicate Portal Client
console.log("[PORTAL] Initializing client-side telemetry connection...");

async function queryTelemetry(debugMode, roleOverride) {
  // Vulnerable telemetry query:
  // When debug=1 and admin=true, the gateway leaks confidential telemetry logs.
  const endpoint = "/api/v1/challenges/web-intro-portal/telemetry";
  const params = new URLSearchParams({
    debug: debugMode ? "1" : "0",
    role: roleOverride || "guest",
    admin: roleOverride === "admin" ? "true" : "false"
  });

  console.log("[DEBUG] Dispatching telemetry probe to: " + endpoint + "?" + params.toString());
  try {
    const res = await fetch(endpoint + "?" + params.toString());
    const data = await res.json();
    console.log("[DEBUG] Telemetry received:", data);
  } catch (err) {
    console.error("[ERROR] Telemetry offline:", err);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  queryTelemetry(true, "guest");
});`
  },
  {
    name: 'README.txt',
    content: `TechX CTF 2026 - Portal of Secrets
Challenge Slug: web-intro-portal
Category: Web Exploitation (Beginner - 100 PTS)

Instructions:
1. Examine the client-side JavaScript bundle (portal.js).
2. Trace the parameters passed to the internal telemetry endpoint.
3. Supply the administrative flag parameters to retrieve the hidden key.`
  }
];
const portalZipPath = path.join(staticDir, 'portal_source.zip');
createZipArchive(portalFiles, portalZipPath);

// B. evidence_photo.jpg (Challenge 11: Metadata Mystery)
// Valid JPEG structure with EXIF Comment containing flag
function createJpegWithExif() {
  const commentStr = 'Author: Syndicate Inspector Alpha | XPComment: techx{3x1f_m3t4d4t4_h1dd3n_1n_pl41n_s1ght}';
  const commentBuf = Buffer.from(commentStr, 'utf8');
  
  const chunks = [];
  chunks.push(Buffer.from([0xFF, 0xD8])); // SOI
  
  // APP0 (JFIF)
  const app0 = Buffer.from([
    0xFF, 0xE0, 0x00, 0x10,
    0x4A, 0x46, 0x49, 0x46, 0x00, // JFIF\0
    0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00
  ]);
  chunks.push(app0);
  
  // COM Marker (0xFF 0xFE, 2 bytes length, comment)
  const comLen = 2 + commentBuf.length;
  const comHeader = Buffer.alloc(4);
  comHeader[0] = 0xFF;
  comHeader[1] = 0xFE;
  comHeader.writeUInt16BE(comLen, 2);
  chunks.push(comHeader);
  chunks.push(commentBuf);
  
  // Minimal valid 16x16 dummy image frame
  // DQT (Quantization table)
  const dqt = Buffer.alloc(69);
  dqt[0] = 0xFF; dqt[1] = 0xDB;
  dqt.writeUInt16BE(67, 2);
  dqt[4] = 0x00; // Table 0
  dqt.fill(16, 5);
  chunks.push(dqt);
  
  // SOF0 (Baseline DCT 16x16)
  const sof0 = Buffer.from([
    0xFF, 0xC0, 0x00, 0x0B,
    0x08, 0x00, 0x10, 0x00, 0x10, // 8-bit, 16 height, 16 width
    0x01, 0x01, 0x11, 0x00        // 1 component (grayscale)
  ]);
  chunks.push(sof0);
  
  // DHT (Huffman Table)
  const dht = Buffer.from([
    0xFF, 0xC4, 0x00, 0x1F,
    0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B
  ]);
  chunks.push(dht);
  
  // SOS (Start of Scan)
  const sos = Buffer.from([
    0xFF, 0xDA, 0x00, 0x08,
    0x01, 0x01, 0x00, 0x00, 0x3F, 0x00
  ]);
  chunks.push(sos);
  
  // Scan data + EOI
  chunks.push(Buffer.from([0x00, 0x3F, 0xFF, 0xD9]));
  
  return Buffer.concat(chunks);
}
const evidenceJpgPath = path.join(staticDir, 'evidence_photo.jpg');
fs.writeFileSync(evidenceJpgPath, createJpegWithExif());

// C. server_deploy.env (Challenge 12: Lost Password)
const envContent = `# ==============================================================================
# SYNDICATE INFRASTRUCTURE DEPLOYMENT ENVIRONMENT CONFIGURATION
# INTERNAL CLOUD ORCHESTRATION - DO NOT COMMIT TO PUBLIC REPOSITORIES
# ==============================================================================
CLUSTER_REGION=ap-south-1
NODE_ENV=staging
ORCHESTRATOR_IP=10.240.12.1
GATEWAY_PORT=8443
METRICS_ENDPOINT=http://10.240.12.15:9090
KAFKA_BROKERS=10.240.14.2:9092,10.240.14.3:9092
REDIS_CLUSTER_URL=redis://cluster-auth:S3cur3R3d1sP4ss2026@10.240.18.5:6379/0
POSTGRES_MASTER_DSN=postgres://syn_admin:VaultK3y_9921_Prod@10.240.20.10:5432/core_telemetry
S3_BACKUP_BUCKET=s3://syndicate-internal-vault-backups
S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# --- INCIDENT ESCALATION & RECOVERY SECRETS ---
BACKUP_ENCRYPTION_ALGO=AES-256-GCM
ADMIN_BACKUP_ENCRYPTION_KEY="techx{3nv_v4rs_sh0uld_n3v3r_b3_c0mm1tt3d}"
RECOVERY_KEYSTORE_PATH=/etc/vault/keystore.jks
JWT_SIGNING_ALGORITHM=RS256
LOG_LEVEL=debug
`;
const envFilePath = path.join(staticDir, 'server_deploy.env');
fs.writeFileSync(envFilePath, envContent, 'utf8');

// D. auth_audit.log (Challenge 16: Log Detective)
function createAuthLog() {
  const lines = [];
  const startEpoch = 1790800000;
  for (let i = 0; i < 1200; i++) {
    const timestamp = new Date((startEpoch + i * 2) * 1000).toISOString().replace('T', ' ').substring(0, 19);
    const port = 40000 + (i % 20000);
    if (i === 842) {
      lines.push(`${timestamp} gateway sshd[15890]: Accepted password for root from 198.51.100.42 port ${port} ssh2: session_key=techx{gr3p_1s_4_s0c_4n4lyst_b3st_fr13nd}`);
      lines.push(`${timestamp} gateway sshd[15890]: pam_unix(sshd:session): session opened for user root by (uid=0)`);
    } else {
      const user = ['admin', 'deploy', 'backup', 'operator', 'postgres', 'service'][i % 6];
      lines.push(`${timestamp} gateway sshd[${10000 + i}]: Failed password for invalid user ${user} from 198.51.100.42 port ${port} ssh2`);
    }
  }
  return lines.join('\n');
}
const authLogPath = path.join(staticDir, 'auth_audit.log');
fs.writeFileSync(authLogPath, createAuthLog(), 'utf8');

// E. network_traffic.pcap (Challenge 17: PCAP Starter)
function createNetworkPcap() {
  const globalHeader = Buffer.alloc(24);
  globalHeader.writeUInt32LE(0xa1b2c3d4, 0); // magic
  globalHeader.writeUInt16LE(2, 4);          // major
  globalHeader.writeUInt16LE(4, 6);          // minor
  globalHeader.writeInt32LE(0, 8);           // thiszone
  globalHeader.writeUInt32LE(0, 12);         // sigfigs
  globalHeader.writeUInt32LE(65535, 16);     // snaplen
  globalHeader.writeUInt32LE(1, 20);         // Ethernet

  const httpPayload = Buffer.from(
    'POST /api/v1/dispatch HTTP/1.1\r\n' +
    'Host: syndicate-internal.lan\r\n' +
    'User-Agent: TelemetryClient/2.0\r\n' +
    'Content-Type: application/json\r\n' +
    'Content-Length: 68\r\n\r\n' +
    '{"status":"active","flag":"techx{w1r3sh4rk_f0ll0w_tcp_str34m_2026}"}\r\n',
    'utf8'
  );

  const ethHeader = Buffer.alloc(14);
  ethHeader.set([0x00, 0x11, 0x22, 0x33, 0x44, 0x55], 0);
  ethHeader.set([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff], 6);
  ethHeader.writeUInt16BE(0x0800, 12); // IPv4

  const ipHeader = Buffer.alloc(20);
  ipHeader[0] = 0x45;
  ipHeader[1] = 0x00;
  const totalIpLen = 20 + 20 + httpPayload.length;
  ipHeader.writeUInt16BE(totalIpLen, 2);
  ipHeader.writeUInt16BE(0x1234, 4);
  ipHeader.writeUInt16BE(0x4000, 6);
  ipHeader[8] = 64;
  ipHeader[9] = 6; // TCP
  ipHeader.writeUInt16BE(0x0000, 10);
  ipHeader.set([192, 168, 1, 45], 12);
  ipHeader.set([192, 168, 1, 10], 16);

  let sum = 0;
  for (let i = 0; i < 20; i += 2) sum += ipHeader.readUInt16BE(i);
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  ipHeader.writeUInt16BE(~sum & 0xffff, 10);

  const tcpHeader = Buffer.alloc(20);
  tcpHeader.writeUInt16BE(54321, 0);
  tcpHeader.writeUInt16BE(80, 2);
  tcpHeader.writeUInt32BE(1001, 4);
  tcpHeader.writeUInt32BE(5001, 8);
  tcpHeader[12] = 0x50; // offset 5
  tcpHeader[13] = 0x18; // PSH, ACK
  tcpHeader.writeUInt16BE(64240, 14);
  tcpHeader.writeUInt16BE(0x0000, 16);
  tcpHeader.writeUInt16BE(0, 18);

  const packetData = Buffer.concat([ethHeader, ipHeader, tcpHeader, httpPayload]);

  const packetHeader = Buffer.alloc(16);
  packetHeader.writeUInt32LE(Math.floor(Date.now() / 1000), 0);
  packetHeader.writeUInt32LE(0, 4);
  packetHeader.writeUInt32LE(packetData.length, 8);
  packetHeader.writeUInt32LE(packetData.length, 12);

  return Buffer.concat([globalHeader, packetHeader, packetData]);
}
const pcapPath = path.join(staticDir, 'network_traffic.pcap');
fs.writeFileSync(pcapPath, createNetworkPcap());

// F. covert_banner.png (Challenge 18: Image in Plain Sight)
function createCovertPng() {
  // Minimal valid 1x1 PNG image with IHDR, IDAT, IEND chunks
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdrData = Buffer.from([
    0x00, 0x00, 0x00, 0x20, // width 32
    0x00, 0x00, 0x00, 0x20, // height 32
    0x08, 0x02, 0x00, 0x00, 0x00 // 8-bit truecolor
  ]);
  const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
  const ihdrChunk = Buffer.alloc(12 + ihdrData.length);
  ihdrChunk.writeUInt32BE(ihdrData.length, 0);
  ihdrChunk.write('IHDR', 4);
  ihdrData.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(ihdrCrc, 8 + ihdrData.length);

  // IDAT chunk (raw scanlines deflated)
  const rawScanlines = Buffer.alloc(32 * (1 + 32 * 3), 0x30);
  const deflated = zlib.deflateSync(rawScanlines);
  const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), deflated]));
  const idatChunk = Buffer.alloc(12 + deflated.length);
  idatChunk.writeUInt32BE(deflated.length, 0);
  idatChunk.write('IDAT', 4);
  deflated.copy(idatChunk, 8);
  idatChunk.writeUInt32BE(idatCrc, 8 + deflated.length);

  // IEND chunk
  const iendData = Buffer.from('IEND');
  const iendCrc = crc32(iendData);
  const iendChunk = Buffer.alloc(12);
  iendChunk.writeUInt32BE(0, 0);
  iendChunk.write('IEND', 4);
  iendChunk.writeUInt32BE(iendCrc, 8);

  // Trailing steganographic payload
  const trailingPayload = Buffer.from(
    '\n\n[CONFIDENTIAL TRANSMISSION ATTACHMENT]\n' +
    'Flag Identifier: techx{st3g0_str1ngs_h1dd3n_1n_pl41n_s1ght}\n' +
    'Status: Verified\n',
    'utf8'
  );

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk, trailingPayload]);
}
const covertPngPath = path.join(staticDir, 'covert_banner.png');
fs.writeFileSync(covertPngPath, createCovertPng());

// G. citadel_validator.py (Challenge 20: The Citadel Keygen - EXPERT #2)
const citadelPyContent = `#!/usr/bin/env python3
"""
TechX CTF 2026 - Citadel Mainframe License Key Validator
Category: Reverse Engineering (Expert)
Points: 450
Target Key Format: techx{...}
"""
import sys

# 4x4 Invertible Transformation Matrix over Z_256 (det = 49, coprime to 256)
TRANSFORM_MATRIX = [
    [3, 2, 1, 1],
    [2, 5, 2, 1],
    [1, 2, 3, 2],
    [2, 1, 1, 3]
]

AFFINE_OFFSET = [13, 37, 42, 79]

# Target encrypted vector for the Citadel mainframe license
TARGET_CONSTRAINTS = [
    162, 93, 63, 39,
    99, 17, 80, 228,
    172, 92, 52, 46,
    126, 50, 32, 4,
    183, 249, 242, 20,
    48, 222, 0, 51,
    149, 209, 243, 122,
    158, 140, 99, 116
]

def verify_key(candidate: str) -> bool:
    candidate = candidate.strip()
    if not (candidate.startswith("techx{") and candidate.endswith("}")):
        return False
    
    body = candidate[6:-1]
    if len(body) != 32:
        return False
    
    transformed = []
    for i in range(0, 32, 4):
        block = [ord(c) for c in body[i:i+4]]
        for r in range(4):
            val = sum(TRANSFORM_MATRIX[r][c] * block[c] for c in range(4)) + AFFINE_OFFSET[r]
            transformed.append(val % 256)
            
    return transformed == TARGET_CONSTRAINTS

def main():
    print("==================================================")
    print("      CITADEL MAINFRAME LICENSE GATEWAY v4.8     ")
    print("==================================================")
    if len(sys.argv) > 1:
        key = sys.argv[1]
    else:
        key = input("Enter License Key: ")
        
    if verify_key(key):
        print("\\n[+] ACCESS GRANTED! Citadel Mainframe Unlocked.")
        print(f"[+] Flag verified: {key}")
    else:
        print("\\n[-] ACCESS DENIED: Invalid license key constraint.")
        sys.exit(1)

if __name__ == "__main__":
    main()
`;
const citadelPyPath = path.join(staticDir, 'citadel_validator.py');
fs.writeFileSync(citadelPyPath, citadelPyContent, 'utf8');

// Summary report
const generatedFiles = [
  'portal_source.zip',
  'evidence_photo.jpg',
  'server_deploy.env',
  'auth_audit.log',
  'network_traffic.pcap',
  'covert_banner.png',
  'citadel_validator.py',
];

console.log('===============================================================');
console.log('TECHX CTF 2026 — STATIC CHALLENGE ARTIFACTS GENERATION COMPLETE');
console.log('===============================================================');
for (const file of generatedFiles) {
  const filePath = path.join(staticDir, file);
  const data = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  console.log(`[✓] ${file.padEnd(24)} Size: ${String(data.length).padStart(7)} bytes | SHA256: ${sha256}`);
}
