# SecondHelping

SecondHelping is a campus surplus-food marketplace. Dining hall staff post closing bags at a discount; students browse meals, filter by dining hall and allergens, reserve food, and show a pickup code to staff.

## Current features

- Student sign-up and login, with hashed passwords and database-backed sessions.
- Role-based access: students use `/student`; dining hall supervisors use `/merchant`.
- Unauthenticated visitors to either dashboard are redirected to the login page at `/`.
- Staff can publish a closing bag with quantity, regular price, discount, allergens, and pickup window.
- Students can filter available meals by dining hall and allergens, then reserve a meal.
- Each reservation has a pickup code. Staff can confirm pickup from the dashboard.
- The food team dashboard summarizes rescued meals, orders, and student savings.

This is a prototype: it does not process payments, send notifications, or scan pickup codes. Staff currently confirm pickups in the dashboard.

## Tech stack

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS 4
- PostgreSQL 16 via Docker Compose
- Prisma 7
- Node.js 20 or newer and pnpm

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create `.env` from `.env.example`, then set `DATABASE_URL` to your PostgreSQL connection string. The example values work with the included Docker Compose configuration.

   ```bash
   copy .env.example .env
   ```

3. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

4. Apply the committed database migrations and generate Prisma Client:

   ```bash
   pnpm db:migrate
   pnpm db:generate
   ```

5. Load demo records:

   ```bash
   pnpm db:seed
   ```

   **The seed deletes existing orders, sessions, listings, foods, users, and dining halls before recreating demo data.** Do not run it against data you need to keep.

6. Start the app:

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Sign-in and demo accounts

New accounts created at `/signup` are student accounts. Supervisor accounts must be provisioned separately. After seeding, these local demo accounts are available:

| Role | Email | Password |
|---|---|---|
| Student | `stu1@buaa.test` | `studentstudent` |
| Main Dining Hall supervisor | `sup1@buaa.test` | `adminadmin` |
| 2nd Dining Hall supervisor | `sup2@buaa.test` | `adminadmin` |

These credentials are for local development only. Change or remove them before deploying the app. Legacy seeded passwords are upgraded to hashed passwords when the account next logs in.

## Main routes

| Route | Purpose |
|---|---|
| `/` | Log in |
| `/signup` | Create a student account |
| `/student` | Browse and filter closing bags, reserve meals, and view pickup codes |
| `/merchant` | Dining hall staff dashboard: post bags and confirm pickups |

## Inspect PostgreSQL data with Prisma Studio

With PostgreSQL running and `DATABASE_URL` configured, start Prisma Studio:

```bash
pnpm prisma studio
```

Studio opens a browser interface for the current database. Browse models such as `DiningHall`, `Food`, `Listing`, `Order`, `User`, and `AuthSession`. Food names, descriptions, and allergens belong to `Food`; each listing references one food record. Session tokens are stored as hashes. Avoid editing relational records in Studio unless you understand their required relations.

## Common commands

```bash
# Start or stop PostgreSQL (the regular stop preserves its data)
docker compose up -d
docker compose down

# Apply committed migrations to a database
pnpm db:migrate

# Create and apply a migration during development after editing schema.prisma
pnpm prisma migrate dev --name describe_the_change

# Regenerate Prisma Client after schema changes
pnpm db:generate

# Recreate demo records (deletes current app records)
pnpm db:seed

# Open the database browser
pnpm prisma studio

# Run lint checks
pnpm lint
```

## Project structure

```text
app/
  actions.ts             Marketplace server actions
  auth-actions.ts        Login, signup, and logout actions
  merchant/page.tsx      Dining hall staff dashboard
  signup/page.tsx        Student registration
  student/page.tsx       Student marketplace
  page.tsx               Login page
  generated/prisma/      Generated Prisma Client (do not edit by hand)
lib/
  auth.ts                Database-backed session helpers and route guards
  password.ts            Password hashing and verification
  prisma.ts              Prisma client singleton
prisma/
  migrations/            Database migration history
  schema.prisma          DiningHall, Food, Listing, Order, User, and AuthSession models
  seed.ts                Destructive local demo-data seed
prisma7.config.ts        Prisma 7 schema, migration, seed, and datasource config
```
