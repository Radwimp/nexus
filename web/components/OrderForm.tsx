'use client';

import { useState, useCallback } from 'react';
import Decimal from 'decimal.js';
import { useExchangeStore } from '@/lib/store';
import { api } from '@/lib/api';

export default function OrderForm() {
  const { selectedPair, userId, bids, asks } = useExchangeStore();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [base, quote] = selectedPair.split('/');

  const handleSubmit = useCallback(async () => {
    setError('');

    const parsedQty = new Decimal(quantity || '0');
    if (parsedQty.lte(0)) {
      setError('Amount must be greater than zero');
      return;
    }

    if (orderType === 'limit') {
      const parsedPrice = new Decimal(price || '0');
      if (parsedPrice.lte(0)) {
        setError('Price must be greater than zero');
        return;
      }
    }

    const bestAsk = asks[0]?.price;
    const bestBid = bids[0]?.price;

    if (orderType === 'market') {
      if (side === 'buy' && !bestAsk) {
        setError('No liquidity on the ask side');
        return;
      }
      if (side === 'sell' && !bestBid) {
        setError('No liquidity on the bid side');
        return;
      }
    }

    const effectivePrice =
      orderType === 'market'
        ? side === 'buy'
          ? bestAsk!
          : bestBid!
        : price;

    setLoading(true);
    try {
      await api.placeOrder({
        userId,
        pair: selectedPair,
        side,
        orderType,
        price: effectivePrice,
        quantity,
      });

      setQuantity('');
      if (orderType === 'limit') setPrice('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setLoading(false);
    }
  }, [side, orderType, price, quantity, selectedPair, userId, asks, bids]);

  // Use Decimal.js to avoid floating-point rounding in the preview total
  const total =
    price && quantity
      ? (() => {
          try {
            return new Decimal(price).mul(new Decimal(quantity)).toFixed(2);
          } catch {
            return '0.00';
          }
        })()
      : '0.00';

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Place Order</h3>
        <div className="type-tabs">
          <button
            className={`type-tab ${orderType === 'limit' ? 'active' : ''}`}
            onClick={() => setOrderType('limit')}
          >
            Limit
          </button>
          <button
            className={`type-tab ${orderType === 'market' ? 'active' : ''}`}
            onClick={() => setOrderType('market')}
          >
            Market
          </button>
        </div>
      </div>
      <div className="order-form">
        <div className="side-tabs">
          <button
            className={`side-tab buy ${side === 'buy' ? 'active' : ''}`}
            onClick={() => setSide('buy')}
          >
            Buy
          </button>
          <button
            className={`side-tab sell ${side === 'sell' ? 'active' : ''}`}
            onClick={() => setSide('sell')}
          >
            Sell
          </button>
        </div>

        {orderType === 'limit' && (
          <div className="form-group">
            <label>Price</label>
            <div className="form-input">
              <input
                type="number"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                step="any"
                min="0"
              />
              <span className="suffix">{quote}</span>
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Amount</label>
          <div className="form-input">
            <input
              type="number"
              placeholder="0.00"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              step="any"
              min="0"
            />
            <span className="suffix">{base}</span>
          </div>
        </div>

        {orderType === 'limit' && (
          <div className="form-group">
            <label>Total</label>
            <div className="form-input">
              <input type="text" value={total} readOnly />
              <span className="suffix">{quote}</span>
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--accent-red)', fontSize: 12 }}>{error}</div>
        )}

        <button
          className={`submit-btn ${side}`}
          onClick={handleSubmit}
          disabled={loading || !quantity || (orderType === 'limit' && !price)}
        >
          {loading ? 'Placing...' : `${side === 'buy' ? 'Buy' : 'Sell'} ${base}`}
        </button>
      </div>
    </div>
  );
}
