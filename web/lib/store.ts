import { create } from 'zustand';

interface PriceLevel {
  price: string;
  quantity: string;
  order_count: number;
}

export interface Trade {
  id: string;
  price: string;
  quantity: string;
  side?: string; // not available for historical trades; present for real-time WS events
  timestamp: string;
}

export interface Order {
  id: string;
  userId: string;
  pair: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  order_type?: 'limit' | 'market'; // snake_case alias returned by some API responses
  price: string;
  quantity: string;
  filled: string;
  status: string;
  createdAt?: string;
}

interface ExchangeState {
  // Market
  selectedPair: string;
  setSelectedPair: (pair: string) => void;

  // Order book
  bids: PriceLevel[];
  asks: PriceLevel[];
  setBids: (bids: PriceLevel[]) => void;
  setAsks: (asks: PriceLevel[]) => void;
  setOrderBook: (bids: PriceLevel[], asks: PriceLevel[]) => void;

  // Trades
  recentTrades: Trade[];
  addTrade: (trade: Trade) => void;
  setRecentTrades: (trades: Trade[]) => void;

  // User
  userId: string;
  setUserId: (id: string) => void;

  // Open orders
  openOrders: Order[];
  setOpenOrders: (orders: Order[]) => void;
  removeOrder: (orderId: string) => void;

  // Balances
  balances: Array<{ currency: string; available: string; locked: string }>;
  setBalances: (balances: Array<{ currency: string; available: string; locked: string }>) => void;
}

export const useExchangeStore = create<ExchangeState>((set) => ({
  selectedPair: 'BTC/USDT',
  setSelectedPair: (pair) => set({ selectedPair: pair }),

  bids: [],
  asks: [],
  setBids: (bids) => set({ bids }),
  setAsks: (asks) => set({ asks }),
  setOrderBook: (bids, asks) => set({ bids, asks }),

  recentTrades: [],
  addTrade: (trade) =>
    set((state) => ({
      recentTrades: [trade, ...state.recentTrades].slice(0, 100),
    })),
  setRecentTrades: (trades) => set({ recentTrades: trades }),

  userId: 'trader-1',
  setUserId: (id) => set({ userId: id }),

  openOrders: [],
  setOpenOrders: (orders) => set({ openOrders: orders }),
  removeOrder: (orderId) =>
    set((state) => ({
      openOrders: state.openOrders.filter((o) => o.id !== orderId),
    })),

  balances: [],
  setBalances: (balances) => set({ balances }),
}));
