'use client';

import { useExchangeStore } from '@/lib/store';
import { useMemo } from 'react';

export default function OrderBook() {
  const { bids, asks, selectedPair } = useExchangeStore();

  const maxTotal = useMemo(() => {
    const bidMax = bids.reduce((sum, b) => sum + parseFloat(b.quantity), 0);
    const askMax = asks.reduce((sum, a) => sum + parseFloat(a.quantity), 0);
    return Math.max(bidMax, askMax, 1);
  }, [bids, asks]);

  const spreadPrice = useMemo(() => {
    if (asks.length > 0 && bids.length > 0) {
      const bestAsk = parseFloat(asks[0].price);
      const bestBid = parseFloat(bids[0].price);
      return {
        value: (bestAsk - bestBid).toFixed(2),
        percentage: (((bestAsk - bestBid) / bestAsk) * 100).toFixed(3),
        lastPrice: bestAsk.toFixed(2),
      };
    }
    return null;
  }, [asks, bids]);

  const [base, quote] = selectedPair.split('/');

  // Calculate cumulative totals
  const asksWithTotal = useMemo(() => {
    let cumulative = 0;
    return [...asks].reverse().map((level) => {
      cumulative += parseFloat(level.quantity);
      return { ...level, cumTotal: cumulative };
    }).reverse();
  }, [asks]);

  const bidsWithTotal = useMemo(() => {
    let cumulative = 0;
    return bids.map((level) => {
      cumulative += parseFloat(level.quantity);
      return { ...level, cumTotal: cumulative };
    });
  }, [bids]);

  return (
    <div className="panel orderbook">
      <div className="panel-header">
        <h3>Order Book</h3>
      </div>
      <div className="orderbook-header">
        <span>Price ({quote})</span>
        <span>Size ({base})</span>
        <span>Total</span>
      </div>

      {/* Asks (sell orders) — lowest at bottom */}
      <div className="orderbook-asks">
        {asksWithTotal.slice(0, 15).map((level, i) => (
          <div key={`ask-${i}`} className="orderbook-row ask">
            <div
              className="depth-bar"
              style={{ width: `${(level.cumTotal / maxTotal) * 100}%` }}
            />
            <span className="price">{formatPrice(level.price)}</span>
            <span className="size">{formatQty(level.quantity)}</span>
            <span className="total">{formatQty(level.cumTotal.toFixed(6))}</span>
          </div>
        ))}
      </div>

      {/* Spread */}
      <div className="orderbook-spread">
        {spreadPrice ? (
          <>
            <span>{spreadPrice.lastPrice}</span>
            <span style={{ fontSize: 11, marginLeft: 8, color: 'var(--text-tertiary)' }}>
              Spread: {spreadPrice.value} ({spreadPrice.percentage}%)
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>No data</span>
        )}
      </div>

      {/* Bids (buy orders) — highest at top */}
      <div className="orderbook-bids">
        {bidsWithTotal.slice(0, 15).map((level, i) => (
          <div key={`bid-${i}`} className="orderbook-row bid">
            <div
              className="depth-bar"
              style={{ width: `${(level.cumTotal / maxTotal) * 100}%` }}
            />
            <span className="price">{formatPrice(level.price)}</span>
            <span className="size">{formatQty(level.quantity)}</span>
            <span className="total">{formatQty(level.cumTotal.toFixed(6))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatPrice(p: string) {
  const n = parseFloat(p);
  if (n >= 1) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toFixed(6);
}

function formatQty(q: string) {
  const n = parseFloat(q);
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}
