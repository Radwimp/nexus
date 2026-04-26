export class TradingPair {
  readonly id: string; // e.g. "BTC/USDT"
  readonly base: string; // e.g. "BTC"
  readonly quote: string; // e.g. "USDT"
  readonly pricePrecision: number;
  readonly quantityPrecision: number;
  readonly minQuantity: string;
  readonly active: boolean;

  constructor(params: {
    id: string;
    base: string;
    quote: string;
    pricePrecision: number;
    quantityPrecision: number;
    minQuantity: string;
    active: boolean;
  }) {
    Object.assign(this, params);
  }
}

export const TRADING_PAIRS: TradingPair[] = [
  new TradingPair({
    id: 'BTC/USDT',
    base: 'BTC',
    quote: 'USDT',
    pricePrecision: 2,
    quantityPrecision: 6,
    minQuantity: '0.000001',
    active: true,
  }),
  new TradingPair({
    id: 'ETH/USDT',
    base: 'ETH',
    quote: 'USDT',
    pricePrecision: 2,
    quantityPrecision: 5,
    minQuantity: '0.00001',
    active: true,
  }),
  new TradingPair({
    id: 'ETH/BTC',
    base: 'ETH',
    quote: 'BTC',
    pricePrecision: 6,
    quantityPrecision: 4,
    minQuantity: '0.0001',
    active: true,
  }),
];
