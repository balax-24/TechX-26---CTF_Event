# TechX CTF 2026 — Master Challenge Matrix & Distribution Analytics

**Tournament:** TechX Madras 2026  
**Infrastructure Target:** High-Concurrency LAN Deployment (`http://127.0.0.1` / `http://172.20.10.2`)  
**Capacity:** ~400 Participants (~100 Teams of 4)  
**Total Challenge Count:** Exactly 20 Official Operational Targets  
**Total Score Pool:** 2,715 PTS  

---

## 1. Master 20-Challenge Matrix

| # | Challenge Slug | Challenge Title | Category | Difficulty | Points | Est. Solve Time | Execution Type | Hints | Checkpoints | Verification Status |
|---|---|---|---|---|---|---|---|:---:|:---:|:---:|
| 1 | `web-source-trace` | Source Trace | Web | Beginner | 50 | 5–10 min | Interactive Sandbox | 3 | 0 | Verified & Passing |
| 2 | `crypto-base64-break` | Base64 Break | Crypto | Beginner | 60 | 5–10 min | Static / Ciphertext | 3 | 0 | Verified & Passing |
| 3 | `web-robots-txt` | Robots Don't Lie | Web | Beginner | 60 | 5–15 min | Interactive Sandbox | 3 | 0 | Verified & Passing |
| 4 | `crypto-hex-hunt` | Hex Hunt | Crypto | Beginner | 75 | 5–15 min | Static / Memory Dump | 3 | 0 | Verified & Passing |
| 5 | `crypto-xor-101` | XOR 101 | Crypto | Beginner | 75 | 10–20 min | Static / Ciphertext | 3 | 0 | Verified & Passing |
| 6 | `forensics-metadata-mystery` | Metadata Mystery | Forensics | Beginner | 80 | 10–20 min | Static File (`.jpg`) | 3 | 0 | Verified & Passing |
| 7 | `forensics-lost-password` | Lost Password | Forensics | Beginner | 85 | 10–20 min | Static File (`.env`) | 3 | 0 | Verified & Passing |
| 8 | `web-cookie-trail` | Cookie Trail | Web | Beginner | 90 | 10–20 min | Interactive Sandbox | 3 | 0 | Verified & Passing |
| 9 | `web-header-hunt` | Header Hunt | Web | Beginner | 90 | 10–20 min | Interactive Sandbox | 3 | 0 | Verified & Passing |
| 10 | `web-intro-portal` | Portal of Secrets | Web | Beginner | 100 | 15–25 min | Static (`.zip`) + Live API | 3 | 0 | Verified & Passing |
| 11 | `crypto-quantum-xor` | Quantum XOR | Crypto | Beginner | 100 | 15–25 min | Static / Ciphertext | 3 | 0 | Verified & Passing |
| 12 | `web-simple-idor` | Simple IDOR | Web | Beginner | 100 | 15–25 min | Interactive Sandbox | 3 | 0 | Verified & Passing |
| 13 | `forensics-log-detective` | Log Detective | Forensics | Beginner | 110 | 15–30 min | Static File (`.log`) | 3 | 0 | Verified & Passing |
| 14 | `network-pcap-starter` | PCAP Starter | Network | Beginner | 110 | 15–30 min | Static File (`.pcap`) | 3 | 0 | Verified & Passing |
| 15 | `forensics-stego-image` | Image in Plain Sight | Forensics | Beginner | 115 | 15–30 min | Static File (`.png`) | 3 | 0 | Verified & Passing |
| 16 | `web-api-discovery` | API Discovery | Web | Intermediate | 140 | 25–45 min | Interactive Sandbox | 3 | 0 | Verified & Passing |
| 17 | `intro-sqli-sandbox` | Intro SQLi Sandbox | Web | Intermediate | 175 | 30–50 min | Interactive Sandbox | 3 | 0 | Verified & Passing |
| 18 | `web-sqli-checkpoint` | Structured Leakage | Web | Intermediate | 200 | 40–70 min | Interactive + Multi-Stage | 3 | 2 | Verified & Passing |
| 19 | `dyn-cloud-sandbox` | Isolated Enclave | Web / Cloud | Expert | 450 | 90–150 min | Dynamic Docker Container | 3 | 0 | Verified & Passing |
| 20 | `rev-vault-matrix` | The Citadel Keygen | Reverse | Expert | 450 | 90–150 min | Static Script (`.py`) | 3 | 0 | Verified & Passing |

---

## 2. Category Distribution Breakdown

```
Category Distribution (20 Challenges Total):
Web:         8 challenges (40.0%) [1,265 PTS]
Crypto:      4 challenges (20.0%) [  310 PTS]
Forensics:   4 challenges (20.0%) [  390 PTS]
Network:     1 challenge  ( 5.0%) [  110 PTS]
Reverse:     1 challenge  ( 5.0%) [  450 PTS]
Cloud/Dyn:   2 challenges (10.0%) [Included under Web / Dynamic Sandbox]
```

| Category | Challenge Count | Total Points | Point Percentage | Difficulty Spectrum | Primary Skills Tested |
|---|:---:|:---:|:---:|---|---|
| **Web** | 8 | 1,265 PTS | 46.6% | Beginner to Expert | Source inspection, robots.txt, cookie tampering, HTTP headers, query tampering, IDOR, OpenAPI enumeration, SQLi bypass, UNION SQLi, dynamic container exploitation. |
| **Crypto** | 4 | 310 PTS | 11.4% | Beginner | Base64 decoding, hex-to-ASCII translation, single-byte XOR involution, zero-key algebra. |
| **Forensics** | 4 | 390 PTS | 14.4% | Beginner | EXIF image metadata, uncommitted `.env` leaks, SOC log filtering (`grep`), PNG trailing payload extraction. |
| **Network** | 1 | 110 PTS | 4.1% | Beginner | Wireshark packet capture analysis, TCP stream reassembly. |
| **Reverse** | 1 | 450 PTS | 16.6% | Expert | 4-dimensional modular affine transform inversion over $\mathbb{Z}/256\mathbb{Z}$. |
| **Dynamic Sandbox** | 2 | 625 PTS | 23.0% | Intermediate to Expert | Live container isolation, gateway routing, SQL sandbox terminals. |

---

## 3. Difficulty Distribution & Score Balance

```
Distribution by Difficulty Tier:
Beginner:     15 Challenges (75.0%)  [1,270 PTS]  — Immediate early momentum & engagement
Intermediate:  3 Challenges (15.0%)  [  515 PTS]  — Skill laddering & checkpoint progression
Expert:        2 Challenges (10.0%)  [  900 PTS]  — Top-tier podium separation
Accessible:   18 Challenges (90.0%)  [1,785 PTS]  — Solvable by college participants with progressive hints
```

| Difficulty Tier | Challenge Count | Total Points | Avg. Points / Chal | Target Audience Persona | Solvability Expectation |
|---|:---:|:---:|:---:|---|---|
| **Beginner** | 15 | 1,270 PTS | 84.7 PTS | College participants with basic programming or CS background. | 70%–95% of active teams will solve 8–15 of these within the first 2 hours. |
| **Intermediate** | 3 | 515 PTS | 171.7 PTS | Teams comfortable with web APIs, SQL injection logic, and schema enumeration. | 35%–60% of teams will solve these; checkpoints in `web-sqli-checkpoint` guarantee partial credit. |
| **Expert** | 2 | 900 PTS | 450.0 PTS | Advanced participants with reverse engineering, linear algebra, or container security experience. | 5%–15% of elite teams will solve; acts as clean podium separator without blocking beginner enjoyment. |

---

## 4. Participant Progression Flow

```mermaid
flowchart TD
    subgraph Phase 1: Onboarding & First Blood (Minutes 0 - 30)
        A1[Source Trace - 50 PTS] --> A2[Base64 Break - 60 PTS]
        A2 --> A3[Robots Don't Lie - 60 PTS]
        A3 --> A4[Hex Hunt - 75 PTS]
        A4 --> A5[XOR 101 - 75 PTS]
    end

    subgraph Phase 2: Foundational Investigation (Minutes 30 - 90)
        B1[Metadata Mystery - 80 PTS] --> B2[Lost Password - 85 PTS]
        B2 --> B3[Cookie Trail - 90 PTS]
        B3 --> B4[Header Hunt - 90 PTS]
        B4 --> B5[Portal of Secrets - 100 PTS]
        B5 --> B6[Quantum XOR - 100 PTS]
        B6 --> B7[Simple IDOR - 100 PTS]
    end

    subgraph Phase 3: Core Security Challenges (Hours 1.5 - 3)
        C1[Log Detective - 110 PTS] --> C2[PCAP Starter - 110 PTS]
        C2 --> C3[Image in Plain Sight - 115 PTS]
        C3 --> C4[API Discovery - 140 PTS]
        C4 --> C5[Intro SQLi Sandbox - 175 PTS]
        C5 --> C6[Structured Leakage - 200 PTS<br/>+ Checkpoints 1 & 2]
    end

    subgraph Phase 4: Championship Capstones (Hours 3 - 5)
        D1[Isolated Enclave - 450 PTS<br/>Dynamic Container Escape] 
        D2[The Citadel Keygen - 450 PTS<br/>Modular Matrix Inversion]
    end

    Phase 1 --> Phase 2
    Phase 2 --> Phase 3
    Phase 3 --> Phase 4
```

---

## 5. Architectural Guarantees & Constraints Maintained

1. **Zero Database Architecture Changes:** All 20 challenges use existing tables (`challenges`, `categories`, `hints`, `challenge_files`, `checkpoints`).
2. **Zero Scoring Engine Changes:** Point calculations, checkpoint awards, hint penalty deductions, and tie-breaking timestamps execute strictly through existing transactional pipelines.
3. **Multi-Tenant Rate Limiting:** Enforces 5 submissions per 30 seconds per team to prevent automated brute-forcing while allowing smooth, responsive gameplay.
4. **Strict Isolation:** Static files are served via internal NGINX redirects (`X-Accel-Redirect`) with JWT authentication verification; dynamic instances operate with read-only root filesystems, bounded memory limits, and isolated internal bridge networks.
