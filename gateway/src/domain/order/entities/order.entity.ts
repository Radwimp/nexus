import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';
export type OrderStatus = 'open' | 'partial' | 'filled' | 'cancelled';

export class Order {
  readonly id: string;
  readonly userId: string;
  readonly pair: string;
  readonly side: OrderSide;
  readonly orderType: OrderType;
  readonly price: Decimal;
  readonly quantity: Decimal;
  filled: Decimal;
  status: OrderStatus;
  readonly createdAt: Date;

  constructor(params: {
    id?: string;
    userId: string;
    pair: string;
    side: OrderSide;
    orderType: OrderType;
    price: string | Decimal;
    quantity: string | Decimal;
    filled?: string | Decimal;
    status?: OrderStatus;
    createdAt?: Date;
  }) {
    this.id = params.id ?? uuidv4();
    this.userId = params.userId;
    this.pair = params.pair;
    this.side = params.side;
    this.orderType = params.orderType;
    this.price = new Decimal(params.price);
    this.quantity = new Decimal(params.quantity);
    this.filled = new Decimal(params.filled ?? '0');
    this.status = params.status ?? 'open';
    this.createdAt = params.createdAt ?? new Date();
  }

  get remaining(): Decimal {
    return this.quantity.minus(this.filled);
  }

  get isFilled(): boolean {
    return this.remaining.lte(0);
  }
}
