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
    label: 'Status',
    hours: '00',
    minutes: '00',
    seconds: '00',
    isOver: false,
  });

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();

      // If scheduled or draft, count down to startTime if present
      if (!isLive && competition?.startTime) {
        const start = new Date(competition.startTime).getTime();
        const diff = start - now;

        if (diff > 0) {
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
      }

      // If live, count down to endTime if present
      if (isLive && competition?.endTime) {
        const end = new Date(competition.endTime).getTime();
        const diff = end - now;

        if (diff > 0) {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);

          setTimeLeft({
            label: 'TIME REMAINING',
            hours: String(hours).padStart(2, '0'),
            minutes: String(minutes).padStart(2, '0'),
            seconds: String(seconds).padStart(2, '0'),
            isOver: false,
          });
          return;
        }
      }

      // Default or ended
      setTimeLeft({
        label: state.toUpperCase(),
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

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 20px',
        backgroundColor: 'var(--color-surface-sunken, #090B10)',
        border: '1px solid var(--color-border, #262B3F)',
        borderRadius: 'var(--radius-lg, 12px)',
        minWidth: '220px',
      }}
    >
      <span
        style={{
          fontSize: 'var(--text-xs, 0.75rem)',
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: isLive ? 'var(--color-brand-bright, #BA68C8)' : 'var(--color-text-muted, #64748B)',
          marginBottom: '4px',
        }}
      >
        {timeLeft.label}
      </span>
      <div
        className="font-mono"
        style={{
          fontSize: 'var(--text-2xl, 1.5rem)',
          fontWeight: 700,
          color: 'var(--color-text, #F8FAFC)',
          letterSpacing: '0.05em',
        }}
      >
        <span>{timeLeft.hours}</span>
        <span style={{ opacity: 0.5, margin: '0 2px' }}>:</span>
        <span>{timeLeft.minutes}</span>
        <span style={{ opacity: 0.5, margin: '0 2px' }}>:</span>
        <span>{timeLeft.seconds}</span>
      </div>
    </div>
  );
};
