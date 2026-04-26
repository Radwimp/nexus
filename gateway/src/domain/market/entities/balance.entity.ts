import Decimal from 'decimal.js';

export class Balance {
  readonly id: string;
  readonly userId: string;
  readonly currency: string;
  available: Decimal;
  locked: Decimal;

  constructor(params: {
    id: string;
    userId: string;
    currency: string;
    available: string | Decimal;
    locked: string | Decimal;
  }) {
    this.id = params.id;
    this.userId = params.userId;
    this.currency = params.currency;
    this.available = new Decimal(params.available);
    this.locked = new Decimal(params.locked);
  }

  get total(): Decimal {
    return this.available.plus(this.locked);
  }

  canLock(amount: Decimal): boolean {
    return this.available.gte(amount);
  }

  lock(amount: Decimal): void {
    if (!this.canLock(amount)) {
      throw new Error(
        `Insufficient balance: available=${this.available}, requested=${amount}`,
      );
    }
    this.available = this.available.minus(amount);
    this.locked = this.locked.plus(amount);
  }

  unlock(amount: Decimal): void {
    if (amount.gt(this.locked)) {
      throw new Error(
        `Cannot unlock ${amount}: only ${this.locked} is locked`,
      );
    }
    this.locked = this.locked.minus(amount);
    this.available = this.available.plus(amount);
  }

  credit(amount: Decimal): void {
    this.available = this.available.plus(amount);
  }

  debitLocked(amount: Decimal): void {
    this.locked = this.locked.minus(amount);
  }
}
