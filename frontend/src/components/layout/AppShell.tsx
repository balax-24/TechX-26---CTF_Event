import React from 'react';
import { Navbar } from './Navbar';
import { StatusBanner } from '../common/StatusBanner';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <StatusBanner />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
      <footer
        style={{
          borderTop: '1px solid var(--color-border, #262B3F)',
          padding: '24px 0',
          backgroundColor: 'var(--color-surface, #161926)',
          fontSize: 'var(--text-xs, 0.75rem)',
          color: 'var(--color-text-muted, #64748B)',
          marginTop: 'auto',
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <span>TechX CTF 2026</span> &bull; <span>IEEE-Affiliated Technical Competition</span>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>Zero-CDN LAN Optimized</span>
            <span>Server-Authoritative Ledger</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
