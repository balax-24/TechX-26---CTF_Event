import React, { useState, useEffect } from 'react';
import { useCompetition } from '../../contexts/CompetitionContext';

export const Countdown: React.FC = () => {
  const { competition, state, isLive } = useCompetition();
  const [timeLeft, setTimeLeft] = useState<{
    label: string;
    hours: string;
    minutes: string;
    seconds: string;
    isOver: boolean;
  }>({
    label: 'STATUS',
    hours: '00',
    minutes: '00',
    seconds: '00',
    isOver: false,
  });

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const start = competition?.startTime ? new Date(competition.startTime).getTime() : null;
      const end = competition?.endTime ? new Date(competition.endTime).getTime() : null;

      // 1. If competition is paused
      if (state === 'paused') {
        setTimeLeft((prev) => ({
          ...prev,
          label: 'PAUSED',
          isOver: false,
        }));
        return;
      }

      // 2. If competition is explicitly ended or archived
      if (state === 'ended' || state === 'archived') {
        setTimeLeft({
          label: 'ENDED',
          hours: '00',
          minutes: '00',
          seconds: '00',
          isOver: true,
        });
        return;
      }

      // 3. Before Start Time (now < start): Count down to 10:30 AM start
      if (start && now < start) {
        const diff = start - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        setTimeLeft({
          label: 'STARTS IN',
          hours: String(hours).padStart(2, '0'),
          minutes: String(minutes).padStart(2, '0'),
          seconds: String(seconds).padStart(2, '0'),
          isOver: false,
        });
        return;
      }

      // 4. Active Live Competition (now >= start && now < end): Live countdown to event end
      if (end && now < end) {
        const diff = end - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        setTimeLeft({
          label: 'LIVE',
          hours: String(hours).padStart(2, '0'),
          minutes: String(minutes).padStart(2, '0'),
          seconds: String(seconds).padStart(2, '0'),
          isOver: false,
        });
        return;
      }

      // 5. Timer Over (now >= end): Off the timer
      setTimeLeft({
        label: 'ENDED',
        hours: '00',
        minutes: '00',
        seconds: '00',
        isOver: true,
      });
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [competition, isLive, state]);

  const getLabelColor = () => {
    if (timeLeft.label === 'LIVE') return 'var(--color-brand-bright, #BA68C8)';
    if (timeLeft.label === 'STARTS IN') return 'var(--color-accent, #38BDF8)';
    if (timeLeft.label === 'PAUSED') return '#F59E0B';
    return 'var(--color-text-muted, #5A657D)';
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '12px',
        padding: '6px 14px',
        backgroundColor: 'var(--color-surface-sunken, #080A0F)',
        border: '1px solid var(--color-border, #1E2335)',
        borderRadius: '2px',
      }}
    >
      <span
        className="font-mono"
        style={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: getLabelColor(),
        }}
      >
        {timeLeft.label}:
      </span>
      <div
        className="font-mono"
        style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: '#F8FAFC',
          letterSpacing: '0.05em',
        }}
      >
        <span>{timeLeft.hours}</span>
        <span style={{ opacity: 0.4, margin: '0 2px' }}>:</span>
        <span>{timeLeft.minutes}</span>
        <span style={{ opacity: 0.4, margin: '0 2px' }}>:</span>
        <span>{timeLeft.seconds}</span>
      </div>
    </div>
  );
};
