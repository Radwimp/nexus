'use client';

import { useState, useCallback } from 'react';
import { useExchangeStore } from '@/lib/store';
import { api } from '@/lib/api';

export default function OpenOrders() {
  const { openOrders, removeOrder, userId } = useExchangeStore();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancel = useCallback(
    async (orderId: string) => {
      setCancellingId(orderId);
      setCancelError(null);
      try {
        await api.cancelOrder(orderId, userId);
        // Only remove from UI after the backend confirms cancellation
        removeOrder(orderId);
      } catch (err: unknown) {
        setCancelError(
          err instanceof Error ? err.message : 'Failed to cancel order',
        );
      } finally {
        setCancellingId(null);
      }
    },
    [userId, removeOrder],
  );

  return (
    <div className="panel-body" style={{ overflow: 'auto' }}>
      {cancelError && (
        <div
          style={{
            color: 'var(--accent-red)',
            fontSize: 12,
            padding: '4px 8px',
            marginBottom: 4,
          }}
        >
          {cancelError}
        </div>
      )}
      {openOrders.length === 0 ? (
        <div className="empty-state">No open orders</div>
      ) : (
        <table className="open-orders-table">
          <thead>
            <tr>
              <th>Pair</th>
              <th>Side</th>
              <th>Type</th>
              <th>Price</th>
              <th>Amount</th>
              <th>Filled</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {openOrders.map((order) => (
              <tr key={order.id}>
                <td>{order.pair}</td>
                <td
                  style={{
                    color:
                      order.side === 'buy'
                        ? 'var(--accent-green)'
                        : 'var(--accent-red)',
                  }}
                >
                  {order.side.toUpperCase()}
                </td>
                <td>{order.orderType || order.order_type}</td>
                <td>{parseFloat(order.price).toFixed(2)}</td>
                <td>{parseFloat(order.quantity).toFixed(6)}</td>
                <td>{parseFloat(order.filled || '0').toFixed(6)}</td>
                <td>{order.status}</td>
                <td>
                  <button
                    className="cancel-btn"
                    onClick={() => handleCancel(order.id)}
                    disabled={cancellingId === order.id}
                  >
                    {cancellingId === order.id ? '...' : 'Cancel'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
