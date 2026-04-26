const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || res.statusText);
  }
  return res.json();
}

export const api = {
  // Markets
  getMarkets: () => request<any[]>('/api/markets'),
  getOrderBook: (pair: string) =>
    request<any>(`/api/markets/${encodeURIComponent(pair)}/orderbook`),
  getRecentTrades: (pair: string) =>
    request<any[]>(`/api/markets/${encodeURIComponent(pair)}/trades`),

  // Orders
  placeOrder: (data: {
    userId: string;
    pair: string;
    side: 'buy' | 'sell';
    orderType: 'limit' | 'market';
    price: string;
    quantity: string;
  }) => request<any>('/api/orders', { method: 'POST', body: JSON.stringify(data) }),

  cancelOrder: (orderId: string, userId: string) =>
    request<any>(`/api/orders/${orderId}?userId=${userId}`, { method: 'DELETE' }),

  getOpenOrders: (userId: string, pair?: string) =>
    request<any[]>(
      `/api/orders?userId=${userId}${pair ? `&pair=${pair}` : ''}`,
    ),

  // Account
  getBalances: (userId: string) =>
    request<any[]>(`/api/account/balances?userId=${userId}`),

  // Seed
  seedOrderBook: (pair: string) =>
    request<any>(`/api/seed/orderbook/${encodeURIComponent(pair)}`, {
      method: 'POST',
    }),

  seedBalance: (userId: string, currency: string, amount: string) =>
    request<any>('/api/seed/balance', {
      method: 'POST',
      body: JSON.stringify({ userId, currency, amount }),
    }),
};
