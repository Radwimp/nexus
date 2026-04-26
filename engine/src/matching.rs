use chrono::Utc;
use rust_decimal::Decimal;
use uuid::Uuid;

use crate::orderbook::OrderBook;
use crate::types::*;

/// Result of matching an incoming order against the book.
pub struct MatchResult {
    /// Trades that were executed during matching.
    pub trades: Vec<Trade>,
    /// Status updates for resting orders that were filled/partially filled.
    pub order_updates: Vec<OrderStatusEvent>,
    /// The incoming order after matching (may be partially or fully filled).
    pub taker_order: Order,
}

/// Pure matching engine — no I/O, no side effects beyond mutating the order book.
/// Implements price-time priority matching.
pub fn match_order(book: &mut OrderBook, command: PlaceOrderCommand) -> MatchResult {
    let now = Utc::now();

    let mut taker = Order {
        id: command.id,
        user_id: command.user_id,
        pair: command.pair,
        side: command.side,
        order_type: command.order_type,
        price: command.price,
        quantity: command.quantity,
        filled: Decimal::ZERO,
        status: OrderStatus::Open,
        created_at: now,
    };

    let mut trades = Vec::new();
    let mut order_updates = Vec::new();

    // Reject orders with non-positive quantity
    if taker.quantity <= Decimal::ZERO {
        return MatchResult {
            trades,
            order_updates: vec![OrderStatusEvent {
                order_id: taker.id,
                status: OrderStatus::Rejected,
                filled: Decimal::ZERO,
                remaining: taker.quantity,
            }],
            taker_order: taker,
        };
    }

    // Match against the opposite side
    let opposite = book.opposite_side_mut(taker.side);

    loop {
        if taker.is_filled() {
            break;
        }

        // Check if there's a matchable price level
        let best_price = match opposite.best_price() {
            Some(p) => p,
            None => break,
        };

        // Price check: does the taker's price cross the best available?
        let price_matches = match (taker.side, taker.order_type) {
            (_, OrderType::Market) => true,
            (Side::Buy, OrderType::Limit) => taker.price >= best_price,
            (Side::Sell, OrderType::Limit) => taker.price <= best_price,
        };

        if !price_matches {
            break;
        }

        // Get the front order at this price level
        let queue = match opposite.best_level_mut() {
            Some(q) => q,
            None => break,
        };

        let maker = match queue.front_mut() {
            Some(o) => o,
            None => break,
        };

        // Calculate fill quantity
        let fill_qty = taker.remaining().min(maker.remaining());
        let fill_price = maker.price; // Trade at maker's price (price improvement for taker)

        // Execute the fill
        taker.filled += fill_qty;
        maker.filled += fill_qty;

        // Determine buyer/seller
        let (buyer_id, seller_id, buy_order_id, sell_order_id) = match taker.side {
            Side::Buy => (
                taker.user_id.clone(),
                maker.user_id.clone(),
                taker.id,
                maker.id,
            ),
            Side::Sell => (
                maker.user_id.clone(),
                taker.user_id.clone(),
                maker.id,
                taker.id,
            ),
        };

        trades.push(Trade {
            id: Uuid::new_v4(),
            pair: taker.pair.clone(),
            buy_order_id,
            sell_order_id,
            buyer_id,
            seller_id,
            price: fill_price,
            quantity: fill_qty,
            timestamp: now,
        });

        let maker_filled = maker.filled;
        let maker_remaining = maker.remaining();
        let maker_status = if maker.is_filled() {
            OrderStatus::Filled
        } else {
            OrderStatus::Partial
        };
        let maker_id = maker.id;
        maker.status = maker_status;

        order_updates.push(OrderStatusEvent {
            order_id: maker_id,
            status: maker_status,
            filled: maker_filled,
            remaining: maker_remaining,
        });

        // Remove maker from book and index if fully filled
        if maker_status == OrderStatus::Filled {
            opposite.pop_best_front();
        }

        // Clean up empty price levels
        opposite.cleanup_best();
    }

    // Update taker status
    taker.status = if taker.is_filled() {
        OrderStatus::Filled
    } else if taker.filled > Decimal::ZERO {
        OrderStatus::Partial
    } else {
        OrderStatus::Open
    };

    // If the taker has remaining quantity and is a limit order, add to book
    if !taker.is_filled() && taker.order_type == OrderType::Limit {
        book.insert(taker.clone());
    }

    // Taker status event
    order_updates.push(OrderStatusEvent {
        order_id: taker.id,
        status: taker.status,
        filled: taker.filled,
        remaining: taker.remaining(),
    });

    MatchResult {
        trades,
        order_updates,
        taker_order: taker,
    }
}

// ─── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn cmd(side: Side, order_type: OrderType, price: Decimal, quantity: Decimal) -> PlaceOrderCommand {
        PlaceOrderCommand {
            id: Uuid::new_v4(),
            user_id: format!("user_{}", side),
            pair: "BTC/USDT".to_string(),
            side,
            order_type,
            price,
            quantity,
        }
    }

    #[test]
    fn test_no_match_when_book_empty() {
        let mut book = OrderBook::new("BTC/USDT".to_string());
        let result = match_order(&mut book, cmd(Side::Buy, OrderType::Limit, dec!(50000), dec!(1)));

        assert!(result.trades.is_empty());
        assert_eq!(result.taker_order.status, OrderStatus::Open);
        assert_eq!(book.bid_count(), 1); // Order rests in book
    }

    #[test]
    fn test_full_match() {
        let mut book = OrderBook::new("BTC/USDT".to_string());

        // Place a sell at 50000
        match_order(&mut book, cmd(Side::Sell, OrderType::Limit, dec!(50000), dec!(1)));
        assert_eq!(book.ask_count(), 1);

        // Place a buy at 50000 — should fully match
        let result = match_order(&mut book, cmd(Side::Buy, OrderType::Limit, dec!(50000), dec!(1)));

        assert_eq!(result.trades.len(), 1);
        assert_eq!(result.trades[0].price, dec!(50000));
        assert_eq!(result.trades[0].quantity, dec!(1));
        assert_eq!(result.taker_order.status, OrderStatus::Filled);
        assert_eq!(book.ask_count(), 0);
    }

    #[test]
    fn test_partial_fill_taker() {
        let mut book = OrderBook::new("BTC/USDT".to_string());

        // Sell 0.5 BTC at 50000
        match_order(&mut book, cmd(Side::Sell, OrderType::Limit, dec!(50000), dec!(0.5)));

        // Buy 1 BTC at 50000 — only 0.5 fills, 0.5 rests
        let result = match_order(&mut book, cmd(Side::Buy, OrderType::Limit, dec!(50000), dec!(1)));

        assert_eq!(result.trades.len(), 1);
        assert_eq!(result.trades[0].quantity, dec!(0.5));
        assert_eq!(result.taker_order.status, OrderStatus::Partial);
        assert_eq!(result.taker_order.filled, dec!(0.5));
        assert_eq!(book.bid_count(), 1); // Remaining rests
        assert_eq!(book.ask_count(), 0);
    }

    #[test]
    fn test_partial_fill_maker() {
        let mut book = OrderBook::new("BTC/USDT".to_string());

        // Sell 2 BTC at 50000
        match_order(&mut book, cmd(Side::Sell, OrderType::Limit, dec!(50000), dec!(2)));

        // Buy 1 BTC at 50000 — seller partially filled
        let result = match_order(&mut book, cmd(Side::Buy, OrderType::Limit, dec!(50000), dec!(1)));

        assert_eq!(result.trades.len(), 1);
        assert_eq!(result.taker_order.status, OrderStatus::Filled);
        assert_eq!(book.ask_count(), 1); // Maker still in book with 1 remaining
    }

    #[test]
    fn test_price_improvement() {
        let mut book = OrderBook::new("BTC/USDT".to_string());

        // Sell at 49500 (below buyer's limit)
        match_order(&mut book, cmd(Side::Sell, OrderType::Limit, dec!(49500), dec!(1)));

        // Buy at 50000 — should match at maker's price (49500)
        let result = match_order(&mut book, cmd(Side::Buy, OrderType::Limit, dec!(50000), dec!(1)));

        assert_eq!(result.trades[0].price, dec!(49500)); // Price improvement!
    }

    #[test]
    fn test_multi_level_matching() {
        let mut book = OrderBook::new("BTC/USDT".to_string());

        // Three sell orders at different prices
        match_order(&mut book, cmd(Side::Sell, OrderType::Limit, dec!(50000), dec!(0.5)));
        match_order(&mut book, cmd(Side::Sell, OrderType::Limit, dec!(50100), dec!(0.5)));
        match_order(&mut book, cmd(Side::Sell, OrderType::Limit, dec!(50200), dec!(0.5)));

        // Buy 1.2 BTC at 50200 — matches first two levels fully + partial third
        let result = match_order(&mut book, cmd(Side::Buy, OrderType::Limit, dec!(50200), dec!(1.2)));

        assert_eq!(result.trades.len(), 3);
        assert_eq!(result.trades[0].price, dec!(50000)); // Best price first
        assert_eq!(result.trades[0].quantity, dec!(0.5));
        assert_eq!(result.trades[1].price, dec!(50100));
        assert_eq!(result.trades[1].quantity, dec!(0.5));
        assert_eq!(result.trades[2].price, dec!(50200));
        assert_eq!(result.trades[2].quantity, dec!(0.2));
        assert_eq!(result.taker_order.status, OrderStatus::Filled);
    }

    #[test]
    fn test_market_order() {
        let mut book = OrderBook::new("BTC/USDT".to_string());

        match_order(&mut book, cmd(Side::Sell, OrderType::Limit, dec!(50000), dec!(1)));

        // Market buy — matches at any price, does NOT rest in book
        let result = match_order(&mut book, cmd(Side::Buy, OrderType::Market, dec!(0), dec!(0.5)));

        assert_eq!(result.trades.len(), 1);
        assert_eq!(result.taker_order.status, OrderStatus::Filled);
        assert_eq!(book.bid_count(), 0); // Market orders don't rest
    }

    #[test]
    fn test_no_self_trade_prevention_for_mvp() {
        // In MVP, we don't implement self-trade prevention
        let mut book = OrderBook::new("BTC/USDT".to_string());

        let mut sell = cmd(Side::Sell, OrderType::Limit, dec!(50000), dec!(1));
        sell.user_id = "user_a".to_string();
        match_order(&mut book, sell);

        let mut buy = cmd(Side::Buy, OrderType::Limit, dec!(50000), dec!(1));
        buy.user_id = "user_a".to_string();
        let result = match_order(&mut book, buy);

        // Self-trade happens (ok for MVP)
        assert_eq!(result.trades.len(), 1);
    }

    #[test]
    fn test_time_priority() {
        let mut book = OrderBook::new("BTC/USDT".to_string());

        // Two sells at same price — first should match first
        let sell1 = cmd(Side::Sell, OrderType::Limit, dec!(50000), dec!(1));
        let sell1_id = sell1.id;
        match_order(&mut book, sell1);

        let sell2 = cmd(Side::Sell, OrderType::Limit, dec!(50000), dec!(1));
        match_order(&mut book, sell2);

        // Buy 1 — should match sell1 (first in time)
        let result = match_order(&mut book, cmd(Side::Buy, OrderType::Limit, dec!(50000), dec!(1)));

        assert_eq!(result.trades[0].sell_order_id, sell1_id);
        assert_eq!(book.ask_count(), 1); // sell2 still in book
    }
}
