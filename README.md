# SecondHelping

A campus meal-sharing platform. Merchants post surplus meals; students claim them.
Built as a walking skeleton: ugly on purpose, but works end to end.

## Tech Stack

- **Next.js 15** (App Router, TypeScript, Tailwind)
- **PostgreSQL 16** (via Docker)
- **Prisma 7** (ORM + migrations)

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker Desktop

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Copy the template and fill in your own values:

```bash
cp .env.example .env
```

### 3. Start the database

```bash
docker compose up -d
```

### 4. Run migrations and generate the Prisma client

```bash
pnpm prisma migrate dev --name init
pnpm prisma generate
```

### 5. Seed the database

Creates one merchant (`merchant-1`) with three listings.

```bash
pnpm prisma db seed
```

### 6. Start the dev server

```bash
pnpm dev
```

Open http://localhost:3000

## Usage

| Route | Role | What you can do |
|---|---|---|
| `/merchant` | Merchant | Post a meal, see remaining quantity drop |
| `/student` | Student | Browse listings, claim a meal |

**Test the full flow:**

1. Go to `/merchant` → fill the form → click **Post**
2. Go to `/student` → the new listing appears → click **Claim**
3. Back to `/merchant` → refresh → remaining quantity has decreased by 1

## Project Structure

```
├── app/
│   ├── actions.ts          # Server Actions (createListing, claimListing)
│   ├── merchant/page.tsx   # Merchant view
│   └── student/page.tsx    # Student view
|   └── generated/prisma/   # Auto-generated Prisma client (gitignored)
├── lib/
│   └── prisma.ts           # Prisma client singleton
├── prisma/
│   ├── schema.prisma       # Data models (Merchant, Listing, Order)
│   ├── seed.ts             # Seed script
│   └── migrations/         # Migration history (committed to git)
├── docker-compose.yml
├── prisma.config.ts        # Prisma 7 config (datasource url, seed command)
└── .env                    # Your secrets (gitignored)
```

## Common Commands

```bash
# Database
docker compose up -d              # Start Postgres
docker compose down               # Stop Postgres (keeps data)
docker compose down -v            # Stop and wipe data

# Prisma
pnpm prisma migrate dev --name X  # Create + apply a new migration
pnpm prisma generate              # Regenerate client (required after schema changes)
pnpm prisma db seed               # Re-run the seed script
pnpm prisma studio                # Open a browser GUI to inspect data

# Reset everything (drop DB, re-migrate, re-seed)
pnpm prisma migrate reset
```