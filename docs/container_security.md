# TechX CTF 2026 — Container Security & Isolation Deep-Dive

---

## 1. Security Boundary Invariants & Guarantees

Dynamic CTF challenges are inherently hostile environments designed to be broken. Our security architecture operates on the principle of **assumed compromise**: once a challenge is exploited, the attacker has interactive shell execution inside the container.

The table below summarizes the core boundary invariants:

| Threat / Invariant Question | Architectural Answer | Mechanism of Enforcement |
| :--- | :--- | :--- |
| **Can a participant control the Docker daemon?** | **NO** | The Docker socket (`/var/run/docker.sock`) is never mounted into challenge containers or the primary Fastify backend. It is restricted exclusively to the isolated `challenge_gateway` container. Route handlers never accept raw Docker commands. |
| **Can a participant select an arbitrary Docker image?** | **NO** | The API accepts only the challenge slug. The image is authoritatively resolved from the server registry (`dynamicChallengeRegistry`). |
| **Can a participant mount a host directory?** | **NO** | No volume binds are permitted. Containers use `read_only: true` with bounded in-memory `tmpfs` mounts only. |
| **Can Team A access or alter Team B's instance?** | **NO** | Containers reside on dedicated per-instance bridge networks (`internal: true, icc: true`). Inter-instance isolation is guaranteed by distinct bridge networks, where cross-bridge forwarding is dropped. Gateway does not route between challenge subnets. |
| **Can a compromised container connect to PostgreSQL or Redis?** | **NO** | PostgreSQL and Redis reside exclusively on `ctf_core_net`. Dynamic challenges run on isolated per-instance networks with no IP interface or route to core data stores. |
| **Can a compromised container connect to Core Fastify?** | **NO** | The primary Fastify backend container never attaches to `techx-inst-net-*`. Only the dedicated `challenge_gateway` has an interface on the challenge network. |
| **Can a fork bomb exhaust host process tables?** | **NO** | Linux process limit (`PidsLimit: 64`) is configured on every container. |
| **Can an attacker monopolize CPU or memory?** | **NO** | Hard memory limits (256MB–512MB) and CPU quotas (0.5 vCPU) are configured via Docker container host configuration. |

---

## 2. Hardened Runtime Configuration

### 2.1 Linux Kernel Capabilities (`CapDrop: ['ALL']`)
All standard Linux capabilities are removed by default:
- `CAP_SYS_ADMIN`: Prevents mount, chroot, debugfs, namespace manipulation.
- `CAP_NET_ADMIN` & `CAP_NET_RAW`: Prevents packet sniffing, raw socket crafting, ARP spoofing.
- `CAP_DAC_OVERRIDE`: Enforces file permissions even for UID 0 (root).
- `CAP_SYS_PTRACE`: Prevents process tracing and memory injection across process trees.

### 2.2 Privilege Escalation Prevention (`no-new-privileges: true`)
The `PR_SET_NO_NEW_PRIVS` flag is set on the container process. This ensures that even if a setuid or setgid binary exists inside the challenge filesystem, it cannot gain elevated capabilities or transition to a higher privilege domain.

### 2.3 Filesystem Protection (`ReadonlyRootfs: true`)
The root filesystem of challenge containers is mounted read-only.
- Filesystem changes cannot persist across container reboots or resets.
- If writable scratch space is required by challenge software, an explicit ephemeral in-memory mount is provided:
  ```text
  /tmp: rw,noexec,nosuid,size=32m
  ```
- Any files written to `/tmp` are bounded by 32MB and cannot be executed as binaries (`noexec`).

### 2.4 Seccomp System Call Filtering
Containers run under Docker's default Seccomp filter. Risky syscalls including:
- `clone` with `CLONE_NEWUSER`
- `bpf`
- `sys_chroot`, `kexec_load`, `reboot`
are blocked by the seccomp profile. Seccomp is never set to unconfined.

---

## 3. Network Topology, Egress & Proxy Safety

```text
+-------------------------------------------------------------------------------+
|                               CTF PLATFORM HOST                               |
|                                                                               |
|   +--------------------------+          +---------------------------------+   |
|   | ctf_core_net (Isolated)  |          | Fastify Core Backend            |   |
|   |                          |          |                                 |   |
|   | - PostgreSQL (5432)      |          | - Application Auth & State      |   |
|   | - Redis (6379)           |          | - NO Docker socket              |   |
|   | - Fastify Core API       |          | - NO Challenge Net presence     |   |
|   +--------------------------+          +----------------+----------------+   |
|                                                          | (ctf_gateway_net)  |
|                                                          v                    |
|                                         +---------------------------------+   |
|                                         | techx_challenge_gateway         |   |
|                                         | - Holds /var/run/docker.sock    |   |
|                                         | - NO DB / Redis / JWT secrets   |   |
|                                         +----------------+----------------+   |
|                                                          |                    |
|                                         +----------------+----------------+   |
|                                         |                                 |   |
|                                         v                                 v   |
|                         +-------------------------------+ +-----------------+ |
|                         | techx-inst-net-A (internal)   | | techx-inst-net-B| |
|                         | - Gateway interface           | | - Gateway intf  | |
|                         | - Challenge Container Team A  | | - Container B   | |
|                         +-------------------------------+ +-----------------+ |
+-------------------------------------------------------------------------------+
```

### 3.1 Network Topology Distinction: Three-Tier Isolation
- **Primary Backend Separation**:
  The primary Fastify container never joins `techx-inst-net-*`. This prevents a compromised challenge container from reaching the core backend application, which holds the database credentials and JWT signing keys.
- **Dedicated Challenge Gateway**:
  A separate container (`techx_challenge_gateway`) handles Docker socket operations and acts as the reverse proxy gateway to challenge instances. It holds no application secrets.
- **Per-Instance Network Architecture**:
  Rather than placing all team containers on a single flat bridge network, the platform provisions a dedicated Docker bridge network per challenge instance (`techx-inst-net-<instanceId[:8]>`) with `internal: true`.
- **Inter-Instance Denial**:
  Containers from different teams cannot communicate with each other over the network. They reside on distinct subnets and Docker bridges, where inter-bridge forwarding is dropped by the kernel's `DOCKER-ISOLATION-STAGE-2` chain.
- **Proxy Attachment & Forwarding**:
  Within each per-instance bridge, intra-bridge communication is enabled (`icc: true`) so that the Fastify reverse proxy (either attached as a container endpoint or routing from host netns) can reach the container's internal IP. Because each bridge contains strictly one challenge container, no cross-challenge communication is possible.

### 3.2 Egress Policy
- Challenge networks are provisioned with `internal: true`.
- Docker disables outbound NAT masquerading on internal networks, and omits default gateway routing, blocking container egress to the public Internet.
- Challenge containers cannot reach the Docker daemon socket, host loopback services, or core data stores (`PostgreSQL`, `Redis`).

### 3.3 Upstream Proxy Target Validation & Redirect Safety
- **Target Resolution**: Participant-controlled upstream host/IP parameters are not accepted. Proxy destinations are resolved exclusively from server-controlled challenge-instance metadata (`http://${instance.internalIp}:${instance.internalPort}/`).
- **Input Sanitization**: Target IPs are validated as dotted-decimal IPv4 addresses, ports as integers (1–65535), and subpaths are checked to reject carriage return (`\r`), newline (`\n`), and null byte (`\0`) injections.
- **Redirect Policy**: Upstream 3xx redirect responses (`301`, `302`, `303`, `307`, `308`) are NOT followed by the reverse proxy. They are passed directly back to the participant with the original `Location` header, ensuring the reverse proxy cannot be turned into an internal HTTP pivoting client.

---

## 4. Secret & Gateway Control Plane Isolation Policy

Dynamic challenge containers never receive platform environment variables:
- `JWT_SECRET`, `COOKIE_SECRET`, `DATABASE_URL`, `REDIS_PASSWORD`, `FLAG_SALT`, `CHALLENGE_GATEWAY_SECRET`, `GATEWAY_SECRET`, and cloud credentials are excluded from container environment configurations.
- Challenges receive only explicit non-secret metadata (e.g. `CHALLENGE_INSTANCE_ID`, `CHALLENGE_PORT`) and challenge-specific allowlisted variables.
- Gateway Control API (`/internal/*`) binds strictly to `ctf_gateway_net` (`eth0`) and loopback; no listening port is bound on challenge network interfaces (`eth1`, `eth2`).
- A compromised challenge container cannot reach the Gateway Control API, Docker socket, or Docker TCP endpoints.

---

## 5. Verification Classification

- **`STATIC CONFIGURATION VERIFIED`**: Memory limits, CPU quotas, PIDs limit, read-only rootfs, `SecurityOpt: ["no-new-privileges:true"]`, `CapDrop: ["ALL"]`, `Privileged: false`, Docker Compose file validation, and schema definitions.
- **`UNIT TEST VERIFIED`**: URL sanitization (CRLF/null-byte rejection), parameter rejection, redirect non-following, orphan reaper logic, concurrency mutexes, and secret exclusion.
- **`DOCKER MOCK/CONTRACT VERIFIED`**: `MockDockerManager` verifies Docker Engine API payload contracts, network isolation simulation, and container creation parameters.
- **`LIVE DOCKER INTEGRATION VERIFIED`**: `NOT VERIFIED` on hosts lacking a running Docker Linux engine daemon.
- **`RUNTIME KERNEL ENFORCEMENT VERIFIED`**: `NOT VERIFIED` on hosts lacking an active Linux cgroups v2 controller or live Seccomp BPF filter.
- **`PROXY-TO-CHALLENGE RUNTIME VERIFICATION`**: `NOT VERIFIED — NO LIVE LINUX DOCKER DAEMON` (Docker Desktop Linux daemon not running on this Windows host).
