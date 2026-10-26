# Security Policy & Vulnerability Disclosure

Security is a primary design pillar of the TechX CTF platform. Because this software orchestrates intentionally vulnerable target applications for educational and competitive cybersecurity exercises, maintaining clear isolation between vulnerable challenge payloads and core tournament infrastructure is paramount.

---

## Supported Versions

| Version | Supported | Security Updates |
|:---:|:---:|:---|
| `1.x` (Main / Master) | Yes | Actively supported with patches and security advisories |
| `< 1.0` | No | Deprecated development prototypes |

---

## Architectural Security Model & Threat Assumptions

The platform enforces a Defense-in-Depth architectural model:

```
[ Public Network / Participant Devices ]
               │
               ▼  (Strict Port 80 Ingress Only)
     [ NGINX Reverse Proxy ]
        ├── /api/v1/* (Forwarded with Rate Limits & CSRF)
        └── /assets/* (Static Bundles, Zero Server-Side Secrets)
               │
               ▼
   [ Fastify Backend (Node 20) ] ◄── NO DOCKER SOCKET ACCESS
        ├── Argon2id Password Hashing (m=19456, t=2, p=1)
        ├── Atomic PostgreSQL Transactions (Immutable Ledger)
        ├── Sliding-Window Rate Limiters (Redis ZSET)
        └── Dual-Tier RBAC (Participant / Admin / Superadmin)
               │
               ▼  (Internal Auth Token Only)
   [ Challenge Gateway Service ] ◄── ONLY SERVICE WITH DOCKER ACCESS
               │
               ▼
[ Ephemeral Challenge Containers ]
   - Non-root user (UID 1000)
   - Read-only root filesystem
   - Capability drop: ALL
   - Isolated Bridge Network (NO ACCESS to Postgres, Redis, or Host)
```

### Critical Security Boundaries
1. **Core Backend Isolation**: The core Fastify backend does not have access to `/var/run/docker.sock`. Even in the event of a full Remote Code Execution (RCE) in the backend layer, an attacker cannot spawn, destroy, or modify host containers.
2. **Challenge Sandbox Isolation**: Dynamic challenge containers run on an internal, unrouted Docker network (`ctf_challenges_net`). They have zero network access to the PostgreSQL database (`5432`) or Redis cache (`6379`).
3. **Gateway Control API Isolation**: The Challenge Gateway control API (`:5000`) is accessible only from the internal Docker network `ctf_gateway_net` and validates an internal cryptographic secret (`CHALLENGE_GATEWAY_SECRET`). It is never exposed publicly.
4. **Timing-Attack Resistance**: Flag comparisons use cryptographic constant-time buffers to prevent timing side-channel discovery.

---

## Warning: Intentionally Vulnerable Containers

> [!WARNING]
> Dynamic challenge containers in this repository (e.g. `docker/challenges/*`) are **intentionally vulnerable** to specific classes of exploits (SQL injection, path traversal, command injection, buffer overflows). 
> 
> - **Never** bridge dynamic challenge networks directly to your public interface or home/office LAN.
> - **Never** grant challenge containers privileged Docker capabilities (`--privileged` or host namespace sharing).
> - Always run the platform with the provided Compose isolation definitions (`docker-compose.lan.yml` or `docker-compose.prod.yml`).

---

## Reporting a Security Vulnerability

If you discover a security vulnerability affecting the platform's core infrastructure (e.g., scoring ledger tampering, privilege escalation, container escape from the sandbox, or unauthenticated admin access):

1. **Do not disclose the vulnerability publicly** or open a public GitHub issue.
2. Please submit a private advisory through **GitHub Security Advisories**:
   - Navigate to the repository's **Security** tab -> **Advisories** -> **Report a vulnerability**.
   - Alternatively, email the maintainers at: `security@techxmadras.org` (or contact repository administrators via private maintainer channels).
3. **Include in your report:**
   - Detailed description of the vulnerability.
   - Exact steps or proof-of-concept (PoC) to reproduce the issue.
   - Potential impact assessment.
   - Recommended remediation or patch, if known.

### Response Timeline
- **Initial Acknowledgement**: Within 48 hours of receipt.
- **Triage & Assessment**: Within 5 business days.
- **Patch Release & Advisory Publication**: Coordinated with the reporter upon resolution.
