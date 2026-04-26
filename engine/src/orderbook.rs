use std::collections::{BTreeMap, HashMap, VecDeque};

use rust_decimal::Decimal;
use uuid::Uuid;

use crate::types::{Order, OrderStatus, PriceLevel, Side};

/// A single side of the order book (bids or asks).
/// Uses BTreeMap for O(log n) price-level operations.
/// Each price level is a VecDeque for FIFO (time priority).
/// A secondary HashMap index provides O(1) order lookup by ID for cancellations.
#[derive(Debug)]
pub(crate) struct BookSide {
    levels: BTreeMap<Decimal, VecDeque<Order>>,
    index: HashMap<Uuid, Decimal>, // order_id → price, for O(1) cancel
    side: Side,
}

impl BookSide {
    fn new(side: Side) -> Self {
        Self {
            levels: BTreeMap::new(),
            index: HashMap::new(),
            side,
        }
    }

    /// Insert an order at its price level.
    pub(crate) fn insert(&mut self, order: Order) {
        self.index.insert(order.id, order.price);
        self.levels
            .entry(order.price)
            .or_default()
            .push_back(order);
    }

    /// Remove a specific order by ID. Returns the removed order if found.
    fn remove(&mut self, order_id: Uuid) -> Option<Order> {
        let price = self.index.remove(&order_id)?;

        let queue = self.levels.get_mut(&price)?;
        let pos = queue.iter().position(|o| o.id == order_id)?;
        let order = queue.remove(pos).unwrap();

        if queue.is_empty() {
            self.levels.remove(&price);
        }

        Some(order)
    }

    /// Get the best price (highest for bids, lowest for asks).
    pub(crate) fn best_price(&self) -> Option<Decimal> {
        match self.side {
            Side::Buy => self.levels.keys().next_back().copied(),
            Side::Sell => self.levels.keys().next().copied(),
        }
    }

    /// Get mutable reference to the queue at the best price level.
    pub(crate) fn best_level_mut(&mut self) -> Option<&mut VecDeque<Order>> {
        match self.side {
            Side::Buy => self.levels.values_mut().next_back(),
            Side::Sell => self.levels.values_mut().next(),
        }
    }

    /// Pop and return the front order from the best price level (used after a fill).
    /// Keeps the index consistent.
    pub(crate) fn pop_best_front(&mut self) -> Option<Order> {
        let queue = match self.side {
            crate::types::Side::Buy => self.levels.values_mut().next_back(),
            crate::types::Side::Sell => self.levels.values_mut().next(),
        }?;
        let order = queue.pop_front()?;
        self.index.remove(&order.id);
        Some(order)
    }

    /// Remove the best price level if it's empty.
    pub(crate) fn cleanup_best(&mut self) {
        let should_remove = match self.side {
            Side::Buy => self
                .levels
                .iter()
                .next_back()
                .map(|(k, v)| (*k, v.is_empty())),
            Side::Sell => self
                .levels
                .iter()
                .next()
                .map(|(k, v)| (*k, v.is_empty())),
        };

        if let Some((price, true)) = should_remove {
            self.levels.remove(&price);
        }
    }

    /// Get top N price levels as PriceLevel summaries.
    fn top_levels(&self, n: usize) -> Vec<PriceLevel> {
        let iter: Box<dyn Iterator<Item = (&Decimal, &VecDeque<Order>)>> = match self.side {
            Side::Buy => Box::new(self.levels.iter().rev()),
            Side::Sell => Box::new(self.levels.iter()),
        };

        iter.take(n)
            .map(|(price, queue)| PriceLevel {
                price: *price,
                quantity: queue.iter().map(|o| o.remaining()).sum(),
                order_count: queue.len(),
            })
            .collect()
    }

    fn order_count(&self) -> usize {
        self.levels.values().map(|q| q.len()).sum()
    }
}

// ─── OrderBook ────────────────────────────────────────────────

/// Full order book for a single trading pair.
/// Contains both sides (bids and asks).
/// Completely I/O-free — pure data structure.
#[derive(Debug)]
pub struct OrderBook {
    #[allow(dead_code)]
    pub pair: String,
    bids: BookSide,
    asks: BookSide,
}

impl OrderBook {
    pub fn new(pair: String) -> Self {
        Self {
            pair,
            bids: BookSide::new(Side::Buy),
            asks: BookSide::new(Side::Sell),
        }
    }

    /// Insert an order into the appropriate side.
    pub fn insert(&mut self, order: Order) {
        match order.side {
            Side::Buy => self.bids.insert(order),
            Side::Sell => self.asks.insert(order),
        }
    }

    /// Cancel (remove) an order by ID. Returns the cancelled order.
    pub fn cancel(&mut self, order_id: Uuid) -> Option<Order> {
        self.bids
            .remove(order_id)
            .or_else(|| self.asks.remove(order_id))
            .map(|mut o| {
                o.status = OrderStatus::Cancelled;
                o
            })
    }

    /// Best bid price.
    pub fn best_bid(&self) -> Option<Decimal> {
        self.bids.best_price()
    }

    /// Best ask price.
    pub fn best_ask(&self) -> Option<Decimal> {
        self.asks.best_price()
    }

    /// Spread = best_ask - best_bid.
    pub fn spread(&self) -> Option<Decimal> {
        match (self.best_ask(), self.best_bid()) {
            (Some(ask), Some(bid)) => Some(ask - bid),
            _ => None,
        }
    }

    /// Get the opposite side for matching.
    pub fn opposite_side_mut(&mut self, side: Side) -> &mut BookSide {
        match side {
            Side::Buy => &mut self.asks,
            Side::Sell => &mut self.bids,
        }
    }

    /// Get snapshot of top N levels on each side.
    pub fn snapshot(&self, depth: usize) -> (Vec<PriceLevel>, Vec<PriceLevel>) {
        (self.bids.top_levels(depth), self.asks.top_levels(depth))
    }

    pub fn bid_count(&self) -> usize {
        self.bids.order_count()
    }

    pub fn ask_count(&self) -> usize {
        self.asks.order_count()
    }
}

// ─── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{OrderType, Side};
    use chrono::Utc;
    use rust_decimal_macros::dec;
    use uuid::Uuid;

    fn make_order(side: Side, price: Decimal, quantity: Decimal) -> Order {
        Order {
            id: Uuid::new_v4(),
            user_id: "test_user".to_string(),
            pair: "BTC/USDT".to_string(),
            side,
            order_type: OrderType::Limit,
            price,
            quantity,
            filled: Decimal::ZERO,
            status: OrderStatus::Open,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn test_insert_and_best_prices() {
        let mut book = OrderBook::new("BTC/USDT".to_string());

        book.insert(make_order(Side::Buy, dec!(50000), dec!(1.0)));
        book.insert(make_order(Side::Buy, dec!(50100), dec!(0.5)));
        book.insert(make_order(Side::Sell, dec!(50200), dec!(1.0)));
        book.insert(make_order(Side::Sell, dec!(50300), dec!(0.5)));

        assert_eq!(book.best_bid(), Some(dec!(50100)));
        assert_eq!(book.best_ask(), Some(dec!(50200)));
        assert_eq!(book.spread(), Some(dec!(100)));
    }

    #[test]
    fn test_cancel_order() {
        let mut book = OrderBook::new("BTC/USDT".to_string());
        let order = make_order(Side::Buy, dec!(50000), dec!(1.0));
        let order_id = order.id;

        book.insert(order);
        assert_eq!(book.bid_count(), 1);

        let cancelled = book.cancel(order_id);
        assert!(cancelled.is_some());
        assert_eq!(cancelled.unwrap().status, OrderStatus::Cancelled);
        assert_eq!(book.bid_count(), 0);
    }

    #[test]
    fn test_fifo_ordering() {
        let mut book = OrderBook::new("BTC/USDT".to_string());
        let order1 = make_order(Side::Buy, dec!(50000), dec!(1.0));
        let order2 = make_order(Side::Buy, dec!(50000), dec!(2.0));
        let id1 = order1.id;

        book.insert(order1);
        book.insert(order2);

        // First order at this price should be first in queue
        let side = book.opposite_side_mut(Side::Sell);
        let queue = side.best_level_mut().unwrap();
        assert_eq!(queue.front().unwrap().id, id1);
    }

    #[test]
    fn test_snapshot() {
        let mut book = OrderBook::new("BTC/USDT".to_string());

        book.insert(make_order(Side::Buy, dec!(50000), dec!(1.0)));
        book.insert(make_order(Side::Buy, dec!(49900), dec!(2.0)));
        book.insert(make_order(Side::Buy, dec!(50000), dec!(0.5)));
        book.insert(make_order(Side::Sell, dec!(50200), dec!(1.0)));
        book.insert(make_order(Side::Sell, dec!(50300), dec!(0.5)));

        let (bids, asks) = book.snapshot(10);

        // Bids: highest first
        assert_eq!(bids.len(), 2);
        assert_eq!(bids[0].price, dec!(50000));
        assert_eq!(bids[0].quantity, dec!(1.5)); // 1.0 + 0.5 at same price
        assert_eq!(bids[0].order_count, 2);
        assert_eq!(bids[1].price, dec!(49900));

        // Asks: lowest first
        assert_eq!(asks.len(), 2);
        assert_eq!(asks[0].price, dec!(50200));
        assert_eq!(asks[1].price, dec!(50300));
    }
}
