'use client';

import { useExchangeStore } from '@/lib/store';

export default function TradeHistory() {
  const { recentTrades, selectedPair } = useExchangeStore();
  const [, quote] = selectedPair.split('/');

  return (
    <div className="panel" style={{ height: '100%' }}>
      <div className="panel-header">
        <h3>Recent Trades</h3>
      </div>
      <div className="orderbook-header">
        <span>Price ({quote})</span>
        <span>Size</span>
        <span>Time</span>
      </div>
      <div className="panel-body">
        {recentTrades.length === 0 ? (
          <div className="empty-state">No recent trades</div>
        ) : (
          recentTrades.slice(0, 50).map((trade, i) => (
            <div key={trade.id || i} className="trade-row">
              <span className={`price ${trade.side ?? ''}`}>
                {formatPrice(trade.price)}
              </span>
              <span className="size">{formatQty(trade.quantity)}</span>
              <span className="time">
                {formatTime(trade.timestamp)}
              </span>
            </div>
          ))
        )}
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

function formatTime(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false });
  } catch {
    return '--:--:--';
  }
}
