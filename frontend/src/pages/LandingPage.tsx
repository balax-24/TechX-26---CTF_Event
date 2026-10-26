import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCompetition } from '../contexts/CompetitionContext';
import { Button } from '../components/common/Button';

export const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { state } = useCompetition();

  const getStatusIndicator = () => {
    switch (state) {
      case 'live':
        return { text: 'COMPETITION LIVE', color: 'var(--color-success, #10B981)', dot: '#10B981' };
      case 'paused':
        return { text: 'TEMPORARILY PAUSED', color: 'var(--color-warning, #F59E0B)', dot: '#F59E0B' };
      case 'ended':
      case 'archived':
        return { text: 'COMPETITION CONCLUDED', color: 'var(--color-danger, #EF4444)', dot: '#EF4444' };
      default:
        return { text: 'STANDBY / SCHEDULED', color: 'var(--color-brand-bright, #BA68C8)', dot: '#BA68C8' };
    }
  };

  const status = getStatusIndicator();

  const domains = [
    { code: '01', name: 'WEB EXPLOITATION', desc: 'Authentication bypasses, injection vectors, CSRF, SSRF, and logic flaws.' },
    { code: '02', name: 'CRYPTOGRAPHY', desc: 'Mathematical cryptanalysis, broken cipher modes, key derivation, and primitives.' },
    { code: '03', name: 'DIGITAL FORENSICS', desc: 'PCAP packet inspection, memory artifact recovery, disk analysis, and triage.' },
    { code: '04', name: 'REVERSE ENGINEERING', desc: 'Binary disassembly, decompilation, anti-debug circumvention, and static analysis.' },
    { code: '05', name: 'BINARY EXPLOITATION', desc: 'Buffer overflows, ROP chain construction, memory corruption, and shellcoding.' },
    { code: '06', name: 'OPEN SOURCE INTEL', desc: 'Reconnaissance, infrastructure mapping, identity attribution, and metadata extraction.' },
  ];

  const flowSteps = [
    { num: '01', title: 'DISCOVER', desc: 'Target recon & endpoint enumeration' },
    { num: '02', title: 'ANALYZE', desc: 'Vulnerability mapping & static decompilation' },
    { num: '03', title: 'EXPLOIT', desc: 'Payload synthesis & defense traversal' },
    { num: '04', title: 'VERIFY', desc: 'Checkpoint token proof generation' },
    { num: '05', title: 'SCORE', desc: 'Authoritative immutable ledger allocation' },
  ];

  const platformFeatures = [
    { title: 'SEQUENTIAL CHECKPOINTS', desc: 'Multi-stage challenges requiring step-by-step cryptographic proofs to unlock downstream attack vectors.' },
    { title: 'SERVER-AUTHORITATIVE SCORING', desc: 'Financial-grade ACID ledger preventing race conditions and retroactive score tampering.' },
    { title: 'REAL-TIME LEADERBOARD', desc: 'Monotonic event streams delivering sub-second score transitions and instant tie-breaker resolution.' },
    { title: 'ISOLATED TEAM ENVIRONMENTS', desc: 'Air-gapped network zones and dedicated container namespaces for every active participant team.' },
    { title: 'DYNAMIC INFRASTRUCTURE', desc: 'On-demand ephemeral target containers with strict cgroup v2 resource and memory containment.' },
  ];

  const rules = [
    { id: 'R-01', text: 'Team members must not share flags, hints, or exploit techniques across team boundaries.' },
    { id: 'R-02', text: 'Attacking tournament scoreboards, SSE relays, or auth infrastructure will cause immediate disqualification.' },
    { id: 'R-03', text: 'Denial of service against other teams or platform services is strictly monitored and forbidden.' },
    { id: 'R-04', text: 'All score transactions and checkpoint verifications are recorded in an append-only audit ledger.' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '64px', padding: '32px 0 64px 0' }}>
      {/* Hero Section */}
      <section className="container">
        <div
          style={{
            border: '1px solid var(--color-border, #1E2335)',
            backgroundColor: 'var(--color-surface, #11141D)',
            borderRadius: 'var(--radius-sm, 2px)',
            padding: '40px 32px',
            position: 'relative',
          }}
        >
          {/* Top Status Bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              paddingBottom: '24px',
              borderBottom: '1px solid var(--color-border, #1E2335)',
              marginBottom: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: status.dot,
                  display: 'inline-block',
                  boxShadow: `0 0 8px ${status.dot}`,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs, 0.75rem)',
                  letterSpacing: '0.1em',
                  fontWeight: 700,
                  color: status.color,
                }}
              >
                {status.text}
              </span>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--color-text-muted, #64748B)',
                letterSpacing: '0.08em',
              }}
            >
              LOC: IEEE MADRAS SECTION &bull; SEC: LEVEL-4 DEFENSE
            </div>
          </div>

          {/* Main Hero Content */}
          <div style={{ maxWidth: '820px' }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs, 0.75rem)',
                color: 'var(--color-brand-bright, #BA68C8)',
                letterSpacing: '0.15em',
                fontWeight: 700,
                marginBottom: '12px',
              }}
            >
              TECHX MADRAS 2026
            </div>

            <h1
              style={{
                fontSize: 'clamp(2rem, 4.5vw, 3.25rem)',
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
                marginBottom: '18px',
                textTransform: 'uppercase',
              }}
            >
              CYBERSECURITY<br />CAPTURE THE FLAG
            </h1>

            <p
              style={{
                fontSize: 'var(--text-base, 1rem)',
                color: 'var(--color-text-secondary, #94A3B8)',
                lineHeight: 1.6,
                marginBottom: '32px',
                maxWidth: '680px',
              }}
            >
              High-intensity technical arena testing offensive exploitation, incident response,
              and security engineering. Featuring multi-tier sequential checkpoints, air-gapped
              dynamic targets, and server-authoritative scoring.
            </p>

            {/* CTAs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
              {isAuthenticated ? (
                <Link to="/dashboard">
                  <Button
                    size="lg"
                    variant="primary"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs, 0.75rem)',
                      letterSpacing: '0.08em',
                    }}
                  >
                    ENTER ARENA &rarr;
                  </Button>
                </Link>
              ) : (
                <Link to="/login">
                  <Button
                    size="lg"
                    variant="primary"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs, 0.75rem)',
                      letterSpacing: '0.08em',
                    }}
                  >
                    SIGN IN
                  </Button>
                </Link>
              )}

              <Link to="/leaderboard">
                <Button
                  size="lg"
                  variant="outline"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                    letterSpacing: '0.08em',
                  }}
                >
                  VIEW LEADERBOARD
                </Button>
              </Link>
            </div>
          </div>

          {/* Compact Technical Panel */}
          <div
            style={{
              marginTop: '40px',
              paddingTop: '24px',
              borderTop: '1px solid var(--color-border, #1E2335)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '20px',
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted, #64748B)' }}>
                EVENT ARCHITECTURE
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 0.875rem)', color: '#FFFFFF', fontWeight: 700, marginTop: '2px' }}>
                STAGE 1-13 ISOLATED
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted, #64748B)' }}>
                SCORING MODEL
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 0.875rem)', color: '#FFFFFF', fontWeight: 700, marginTop: '2px' }}>
                POSTGRESQL SNAPSHOT + SSE
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted, #64748B)' }}>
                ACCESS MODE
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 0.875rem)', color: '#FFFFFF', fontWeight: 700, marginTop: '2px' }}>
                ADMIN PROVISIONED ONLY
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted, #64748B)' }}>
                TARGET RUNTIME
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm, 0.875rem)', color: '#FFFFFF', fontWeight: 700, marginTop: '2px' }}>
                LINUX CGROUP V2 RUNTIME
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 01 / CHALLENGE DOMAINS */}
      <section className="container">
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs, 0.75rem)',
              color: 'var(--color-brand-bright, #BA68C8)',
              letterSpacing: '0.12em',
              fontWeight: 700,
              marginBottom: '6px',
            }}
          >
            SECTION 01
          </div>
          <h2 style={{ fontSize: 'var(--text-xl, 1.25rem)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            CHALLENGE DOMAINS
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
          }}
        >
          {domains.map((d) => (
            <div
              key={d.code}
              style={{
                backgroundColor: 'var(--color-surface, #11141D)',
                border: '1px solid var(--color-border, #1E2335)',
                borderRadius: 'var(--radius-sm, 2px)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--color-border, #1E2335)',
                  paddingBottom: '8px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                    color: 'var(--color-brand-bright, #BA68C8)',
                    fontWeight: 700,
                  }}
                >
                  DOMAIN // {d.code}
                </span>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    backgroundColor: 'var(--color-brand, #6A1B9A)',
                  }}
                />
              </div>
              <h3
                style={{
                  fontSize: 'var(--text-sm, 0.875rem)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: '#FFFFFF',
                  marginTop: '4px',
                }}
              >
                {d.name}
              </h3>
              <p style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--color-text-secondary, #94A3B8)', lineHeight: 1.5 }}>
                {d.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 02 / COMPETITION FLOW */}
      <section className="container">
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs, 0.75rem)',
              color: 'var(--color-brand-bright, #BA68C8)',
              letterSpacing: '0.12em',
              fontWeight: 700,
              marginBottom: '6px',
            }}
          >
            SECTION 02
          </div>
          <h2 style={{ fontSize: 'var(--text-xl, 1.25rem)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            COMPETITION FLOW
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
          }}
        >
          {flowSteps.map((s) => (
            <div
              key={s.num}
              style={{
                backgroundColor: 'var(--color-surface, #11141D)',
                border: '1px solid var(--color-border, #1E2335)',
                borderRadius: 'var(--radius-sm, 2px)',
                padding: '20px',
                position: 'relative',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs, 0.75rem)',
                  color: 'var(--color-text-muted, #64748B)',
                  marginBottom: '8px',
                }}
              >
                PHASE {s.num}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-base, 1rem)',
                  fontWeight: 800,
                  color: 'var(--color-brand-bright, #BA68C8)',
                  letterSpacing: '0.06em',
                  marginBottom: '6px',
                }}
              >
                {s.title}
              </div>
              <p style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--color-text-secondary, #94A3B8)', lineHeight: 1.4 }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 03 / PLATFORM CAPABILITIES */}
      <section className="container">
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs, 0.75rem)',
              color: 'var(--color-brand-bright, #BA68C8)',
              letterSpacing: '0.12em',
              fontWeight: 700,
              marginBottom: '6px',
            }}
          >
            SECTION 03
          </div>
          <h2 style={{ fontSize: 'var(--text-xl, 1.25rem)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            PLATFORM ARCHITECTURE
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          {platformFeatures.map((f, i) => (
            <div
              key={i}
              style={{
                backgroundColor: 'var(--color-surface, #11141D)',
                border: '1px solid var(--color-border, #1E2335)',
                borderRadius: 'var(--radius-sm, 2px)',
                padding: '24px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs, 0.75rem)',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: '#FFFFFF',
                  marginBottom: '10px',
                }}
              >
                {f.title}
              </div>
              <p style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--color-text-secondary, #94A3B8)', lineHeight: 1.6 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 04 / RULES OF ENGAGEMENT */}
      <section className="container">
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs, 0.75rem)',
              color: 'var(--color-brand-bright, #BA68C8)',
              letterSpacing: '0.12em',
              fontWeight: 700,
              marginBottom: '6px',
            }}
          >
            SECTION 04
          </div>
          <h2 style={{ fontSize: 'var(--text-xl, 1.25rem)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            RULES OF ENGAGEMENT
          </h2>
        </div>

        <div
          style={{
            backgroundColor: 'var(--color-surface, #11141D)',
            border: '1px solid var(--color-border, #1E2335)',
            borderRadius: 'var(--radius-sm, 2px)',
            padding: '24px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {rules.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                gap: '16px',
                alignItems: 'flex-start',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--color-surface-sunken, #07080C)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs, 0.75rem)',
                  fontWeight: 700,
                  color: 'var(--color-brand-bright, #BA68C8)',
                  letterSpacing: '0.08em',
                  minWidth: '45px',
                }}
              >
                {r.id}
              </span>
              <p style={{ fontSize: 'var(--text-sm, 0.875rem)', color: 'var(--color-text, #F8FAFC)', lineHeight: 1.5 }}>
                {r.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer
        className="container"
        style={{
          borderTop: '1px solid var(--color-border, #1E2335)',
          paddingTop: '32px',
          marginTop: '32px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img
            src="/TechX White New.png"
            alt="TechX Madras 2026"
            style={{
              height: '28px',
              width: 'auto',
              maxHeight: '28px',
              objectFit: 'contain',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs, 0.75rem)',
              color: 'var(--color-text-muted, #64748B)',
            }}
          >
            &copy; 2026 TECHX MADRAS &bull; IEEE COMPUTER SOCIETY
          </span>
        </div>

        <div style={{ display: 'flex', gap: '20px' }}>
          <Link
            to="/leaderboard"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs, 0.75rem)',
              color: 'var(--color-text-secondary, #94A3B8)',
            }}
          >
            LEADERBOARD
          </Link>
          <Link
            to="/login"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs, 0.75rem)',
              color: 'var(--color-text-secondary, #94A3B8)',
            }}
          >
            PARTICIPANT LOGIN
          </Link>
        </div>
      </footer>
    </div>
  );
};
