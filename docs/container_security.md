# TechX CTF 2026 — Container Security & Isolation Deep-Dive

---

## 1. Security Boundary Invariants & Guarantees

Dynamic CTF challenges are inherently hostile environments designed to be broken. Our security architecture operates on the principle of **assumed compromise**: once a challenge is exploited, the attacker has full unprivileged or root execution inside the container.

The table below summarizes the core boundary invariants:

| Threat / Invariant Question | Architectural Answer | Mechanism of Enforcement |
| :--- | :--- | :--- |
| **"If the participant controls every byte of input sent to the challenge, can they control Docker?"** | **NO** | The Docker socket (`/var/run/docker.sock`) is never mounted into challenge containers. Route handlers never accept raw Docker commands. |
| **"Can a participant select an arbitrary Docker image?"** | **NO** | The API accepts only the challenge slug. The image is authoritatively resolved from the server registry (`dynamicChallengeRegistry`). |
| **"Can a participant mount a host directory?"** | **NO** | No volume binds are permitted. Containers use `read_only: true` with bounded in-memory `tmpfs` mounts only. |
| **"Can Team A access or control Team B's instance?"** | **NO** | Containers reside on isolated networks with no inter-container routing. Reverse proxy strictly validates session, team ID, and DB ownership. |
| **"Can a compromised container attack PostgreSQL or Redis?"** | **NO** | PostgreSQL and Redis reside exclusively on `ctf_core_net`. Dynamic challenges run on `ctf_challenges_net` which has no IP interface or route to core data stores. |
| **"Can a fork bomb take down the host?"** | **NO** | Linux process limit (`PidsLimit: 64`) is enforced on every container at the kernel level. |
| **"Can an attacker monopolize CPU or memory?"** | **NO** | Hard memory limits (256MB–512MB) and CPU quotas (0.5 vCPU) are enforced via Linux cgroups. |

---

## 2. Hardened Runtime Configuration

### 2.1 Linux Kernel Capabilities (`CapDrop: ['ALL']`)
All standard Linux capabilities are removed:
- `CAP_SYS_ADMIN`: Prevents mount, chroot, debugfs, namespace manipulation.
- `CAP_NET_ADMIN` & `CAP_NET_RAW`: Prevents packet sniffing, raw socket crafting, ARP spoofing.
- `CAP_DAC_OVERRIDE`: Enforces file permissions even for UID 0 (root).
- `CAP_SYS_PTRACE`: Prevents process tracing and memory injection across process trees.

### 2.2 Privilege Escalation Prevention (`no-new-privileges: true`)
The `PR_SET_NO_NEW_PRIVS` flag is set on the container root process. This ensures that even if a setuid or setgid binary (such as `/usr/bin/sudo` or custom setuid binaries) exists inside the challenge filesystem, it cannot gain elevated capabilities or transition to a higher privilege domain.

### 2.3 Filesystem Protection (`ReadonlyRootfs: true`)
The root filesystem of challenge containers is mounted read-only.
- Attackers cannot write rootkits, overwrite system binaries, or alter configuration files.
- If writable scratch space is required by challenge software, an explicit ephemeral in-memory mount is provided:
  ```text
  /tmp: rw,noexec,nosuid,size=32m
  ```
- Any files written to `/tmp` are bounded by 32MB and cannot be executed as binaries (`noexec`).

### 2.4 Seccomp System Call Filtering
Containers run under Docker's default or hardened Seccomp filter. Risky syscalls including:
- `clone` with `CLONE_NEWUSER` (prevents user namespace breakout exploits)
- `bpf` (prevents Berkeley Packet Filter kernel exploits)
- `sys_chroot`, `kexec_load`, `reboot`
are blocked at the kernel syscall boundary.

---

## 3. Network Isolation Architecture

```text
+-----------------------------------------------------------------+
|                       CTF PLATFORM HOST                         |
|                                                                 |
|   +--------------------------+    +-------------------------+   |
|   | ctf_core_net (Isolated)  |    | ctf_challenges_net      |   |
|   |                          |    |                         |   |
|   | - PostgreSQL (5432)      |    | - Challenge Inst A      |   |
|   | - Redis (6379)           |    | - Challenge Inst B      |   |
|   | - Fastify Core API       |<---| - Fastify Proxy Client  |   |
|   +--------------------------+    +-------------------------+   |
+-----------------------------------------------------------------+
```

1. **Database & Cache Inaccessibility**:
   The PostgreSQL and Redis containers do not join `ctf_challenges_net`. Docker bridge routing prevents packets originating from `ctf_challenges_net` from reaching `ctf_core_net`.
2. **Reverse Proxy Upstream Resolution (Anti-SSRF)**:
   The reverse proxy at `/api/v1/challenges/:slug/instance/proxy/*` resolves upstream destination strictly using `http://${instance.internalIp}:${instance.internalPort}/`.
   - Any query parameters such as `?url=`, `?host=`, or `?target=` are completely ignored.
   - Any attempt to forge request paths to internal IP ranges (127.0.0.1, 169.254.169.254) is structurally impossible because the destination host is locked to the DB record.

---

## 4. Secret Isolation Policy

Dynamic challenge containers never receive platform environment variables:
- `JWT_SECRET`, `COOKIE_SECRET`, `DATABASE_URL`, `REDIS_PASSWORD`, `FLAG_SALT` are explicitly forbidden by `dynamicChallengeRegistry.validateDefinition()`.
- If an administrator or author attempts to register a challenge containing sensitive variable names, the platform aborts startup with a `Security Violation` error.
- Challenges receive only explicit non-secret metadata (e.g. `CHALLENGE_INSTANCE_ID`).
