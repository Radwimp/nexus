'use client';

import { useExchangeStore } from '@/lib/store';
import { api } from '@/lib/api';
import { useState, useCallback } from 'react';

const PAIRS = ['BTC/USDT', 'ETH/USDT', 'ETH/BTC'];

export default function Header() {
  const { selectedPair, setSelectedPair, userId, setUserId } = useExchangeStore();
  const [seeding, setSeeding] = useState(false);

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    try {
      // Seed balance for current user
      const [base, quote] = selectedPair.split('/');
      await api.seedBalance(userId, base, '100');
      await api.seedBalance(userId, quote, '1000000');
      // Seed orderbook
      await api.seedOrderBook(selectedPair);
    } catch (err) {
      console.error('Seed failed:', err);
    } finally {
      setSeeding(false);
    }
  }, [selectedPair, userId]);

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div className="logo">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M16 2L4 9v14l12 7 12-7V9L16 2z" stroke="currentColor" strokeWidth="2" />
            <path d="M16 8l-6 3.5v7L16 22l6-3.5v-7L16 8z" fill="currentColor" opacity="0.3" />
            <path d="M16 12l-3 1.75v3.5L16 19l3-1.75v-3.5L16 12z" fill="currentColor" />
          </svg>
          NEXUS
        </div>
        <div className="pair-selector">
          {PAIRS.map((pair) => (
            <button
              key={pair}
              className={`pair-btn ${selectedPair === pair ? 'active' : ''}`}
              onClick={() => setSelectedPair(pair)}
            >
              {pair}
            </button>
          ))}
        </div>
      </div>

      <div className="header-controls">
        <button
          className="seed-btn"
          onClick={handleSeed}
          disabled={seeding}
        >
          {seeding ? 'Seeding...' : '🌱 Seed Order Book'}
        </button>
        <div className="user-bar">
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>User:</span>
          <input
            className="user-input"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="user-id"
          />
        </div>
      </div>
    </header>
  );
}
