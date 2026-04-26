'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useExchangeStore } from '@/lib/store';
import { api } from '@/lib/api';
import Header from '@/components/Header';
import OrderBook from '@/components/OrderBook';
import OrderForm from '@/components/OrderForm';
import TradingChart from '@/components/TradingChart';
import TradeHistory from '@/components/TradeHistory';
import OpenOrders from '@/components/OpenOrders';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export default function TradingPage() {
  const {
    selectedPair,
    userId,
    setOrderBook,
    addTrade,
    setRecentTrades,
    setOpenOrders,
    setBalances,
  } = useExchangeStore();

  const socketRef = useRef<Socket | null>(null);
  const prevPairRef = useRef<string>(selectedPair);
  // Keep a ref so the WS connect handler always subscribes to the current pair
  const selectedPairRef = useRef<string>(selectedPair);
  selectedPairRef.current = selectedPair;

  const [bottomTab, setBottomTab] = useState<'orders' | 'trades' | 'balances'>('orders');

  const fetchData = useCallback(async () => {
    try {
      const [orderbook, trades, orders, balances] = await Promise.all([
        api.getOrderBook(selectedPair),
        api.getRecentTrades(selectedPair),
        api.getOpenOrders(userId, selectedPair),
        api.getBalances(userId),
      ]);

      setOrderBook(orderbook.bids || [], orderbook.asks || []);
      setRecentTrades(
        trades.map((t: { id: string; price: string; quantity: string; createdAt?: string; created_at?: string }) => ({
          id: t.id,
          price: t.price,
          quantity: t.quantity,
          // side is not available in historical trade data; leave undefined
          timestamp: t.createdAt || t.created_at || new Date().toISOString(),
        })),
      );
      setOpenOrders(orders);
      setBalances(balances);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  }, [selectedPair, userId, setOrderBook, setRecentTrades, setOpenOrders, setBalances]);

  // Initial fetch & polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // WebSocket connection (created once; pair switching handled separately)
  useEffect(() => {
    const socket = io(`${WS_URL}/market`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WS connected');
      // Use ref to always subscribe to the current pair, even after reconnects
      socket.emit('subscribe', { pair: selectedPairRef.current });
    });

    socket.on('orderbook', (data: { bids: unknown[]; asks: unknown[] }) => {
      if (data.bids && data.asks) {
        setOrderBook(
          data.bids as Parameters<typeof setOrderBook>[0],
          data.asks as Parameters<typeof setOrderBook>[1],
        );
      }
    });

    socket.on('trade', (data: { id: string; price: string; quantity: string; side?: string; timestamp: string }) => {
      addTrade(data);
    });

    socket.on('disconnect', () => {
      console.log('WS disconnected');
    });

    return () => {
      socket.disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch pair subscription when selectedPair changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;

    if (prevPairRef.current !== selectedPair) {
      socket.emit('unsubscribe', { pair: prevPairRef.current });
      socket.emit('subscribe', { pair: selectedPair });
      prevPairRef.current = selectedPair;
    }
  }, [selectedPair]);

  const { balances } = useExchangeStore();

  return (
    <div className="app-layout">
      <Header />
      <div className="trading-grid">
        {/* Chart — top left */}
        <TradingChart />

        {/* Order Book — top center */}
        <OrderBook />

        {/* Order Form — top right */}
        <OrderForm />

        {/* Bottom panel — spans full width */}
        <div className="panel" style={{ gridColumn: '1 / -1' }}>
          <div className="bottom-tabs">
            <button
              className={`bottom-tab ${bottomTab === 'orders' ? 'active' : ''}`}
              onClick={() => setBottomTab('orders')}
            >
              Open Orders
            </button>
            <button
              className={`bottom-tab ${bottomTab === 'trades' ? 'active' : ''}`}
              onClick={() => setBottomTab('trades')}
            >
              Trade History
            </button>
            <button
              className={`bottom-tab ${bottomTab === 'balances' ? 'active' : ''}`}
              onClick={() => setBottomTab('balances')}
            >
              Balances
            </button>
          </div>
          {bottomTab === 'orders' && <OpenOrders />}
          {bottomTab === 'trades' && <TradeHistory />}
          {bottomTab === 'balances' && (
            <div className="panel-body" style={{ overflow: 'auto' }}>
              {balances.length === 0 ? (
                <div className="empty-state">
                  No balances. Click &quot;Seed Order Book&quot; to get started.
                </div>
              ) : (
                <table className="open-orders-table">
                  <thead>
                    <tr>
                      <th>Currency</th>
                      <th>Available</th>
                      <th>Locked</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((b) => (
                      <tr key={b.currency}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {b.currency}
                        </td>
                        <td>{parseFloat(b.available).toFixed(6)}</td>
                        <td>{parseFloat(b.locked).toFixed(6)}</td>
                        <td>
                          {(parseFloat(b.available) + parseFloat(b.locked)).toFixed(6)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
