# NEXUS Exchange

High-performance cryptocurrency exchange MVP built with **Rust** and **TypeScript**.

## Architecture

```
┌──────────────────┐    ┌─────────────────┐    ┌────────────────┐
│   Next.js Web    │───▶│  NestJS Gateway │───▶│ Redis Streams  │
│   (Port 3000)    │◀───│   (Port 3001)   │◀───│                │
└──────────────────┘    └─────────────────┘    └────────┬───────┘
                                │                       │
                                ▼                       ▼
                         ┌──────────────┐     ┌──────────────────┐
                         │  PostgreSQL  │     │  Rust Matching   │
                         │              │     │      Engine      │
                         └──────────────┘     └──────────────────┘
```

- **Matching Engine** (Rust): I/O-free price-time priority order matching
- **API Gateway** (NestJS + DDD): REST API + WebSocket, strict layered architecture
- **Frontend** (Next.js): Real-time trading UI with TradingView charts

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Rust (1.75+)
- Bun (1.0+)

### 1. Start Infrastructure
```bash
docker-compose up -d
```

### 2. Run Database Migrations
```bash
cd gateway
bun run ts-node src/migrate.ts
```

### 3. Start Matching Engine
```bash
cd engine
cargo run --release
```

### 4. Start API Gateway
```bash
cd gateway
bun run start:dev
```

### 5. Start Frontend
```bash
cd web
bun run dev
```

### 6. Open Browser
Navigate to http://localhost:3000

Click **"🌱 Seed Order Book"** to populate the order book with test data.

## Trading Pairs
- BTC/USDT
- ETH/USDT
- ETH/BTC

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Matching Engine | Rust, Tokio, BTreeMap |
| API Gateway | NestJS, Drizzle ORM, ioredis |
| Frontend | Next.js, TradingView Charts, Zustand |
| Database | PostgreSQL 16 |
| Message Bus | Redis Streams |
| IPC | mpsc channels (engine), Redis pub/sub (gateway→web) |
