export class Trade {
  readonly id: string;
  readonly pair: string;
  readonly buyOrderId: string;
  readonly sellOrderId: string;
  readonly buyerId: string;
  readonly sellerId: string;
  readonly price: string;
  readonly quantity: string;
  readonly timestamp: Date;

  constructor(params: {
    id: string;
    pair: string;
    buyOrderId: string;
    sellOrderId: string;
    buyerId: string;
    sellerId: string;
    price: string;
    quantity: string;
    timestamp: Date;
  }) {
    Object.assign(this, params);
  }
}
