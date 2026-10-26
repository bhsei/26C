# SecondHelping

SecondHelping is a campus surplus-food marketplace. Dining hall staff post closing bags at a discount; students browse meals, filter by dining hall and allergens, reserve food, and show a pickup code to staff.

## Current features

- Student sign-up and login, with hashed passwords and database-backed sessions.
- Role-based access: students use `/student`; dining hall supervisors use `/merchant`.
- Unauthenticated visitors to either dashboard are redirected to the login page at `/`.
- Staff can publish a closing bag with quantity, regular price, discount, allergens, and pickup window.
- Supervisors can match a meal photo to an existing food catalog item while preparing a listing.
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

## AI chatbot (Ollama)

Signed-in users get a floating chat assistant (bottom-right ✳ bubble) that answers general questions and queries live app data — available meals, dining halls, the user's orders and pickup codes, and the current time — through local tool calls.

The assistant runs against a local [Ollama](https://ollama.com) server, so no API key is needed:

1. Install Ollama, then pull a tool-capable model (`qwen2:7b` is the default — `llama3.2` also works but follows instructions less reliably):

   ```bash
   ollama pull qwen2:7b
   ```

2. Make sure the server is running (`ollama serve`, usually automatic after install) and set these in `.env` (defaults shown):

   ```bash
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=qwen2:7b
   ```

3. Restart `pnpm dev`. Open any dashboard page while signed in and click the ✳ bubble.

Requests are handled by `app/api/chat/route.ts` (login required). Tool definitions and their database queries live in `lib/chat-tools.ts`; the Ollama client and tool-calling loop are in `lib/ollama.ts`. If Ollama is not running, the widget shows a friendly error and the rest of the app is unaffected.

## AI meal photo matching (Ollama)

Supervisors can upload a meal photo from **Publish Listings** and select **Process** to suggest a matching existing food catalog item. The photo is previewed in the browser; image processing only changes the Food selector. Supervisors still review the choice and enter all listing details, including price and discount, manually. It does not create or publish a listing. If identification fails or is uncertain, choose a food manually.

The matcher runs locally through Ollama and requires Python 3.10+ on the application server. Pull the vision model separately from the chatbot model:

```bash
ollama pull qwen2.5vl:3b
```

Set these in `.env` (defaults shown):

```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_VISION_MODEL=qwen2.5vl:3b
```

`OLLAMA_VISION_MODEL` is separate from `OLLAMA_MODEL`, which configures the text-only chatbot. The API route runs `app/scripts/classify_meal.py`; on Windows it calls `python` from `PATH`, or you can set `PYTHON_PATH` to the Python executable. The endpoint accepts JPEG, PNG, WebP, and GIF images up to 10 MB. The uploaded image and generated catalog file are held in a temporary directory and removed after processing.

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
  api/chat/route.ts      AI assistant endpoint (login required)
  api/food-image-match/route.ts  Supervisor meal-image matching endpoint
  api/notifications/route.ts Notifications trigger logic
  components/ChatWidget.tsx  Floating assistant chat bubble
  components/FoodImageMatcher.tsx  Meal photo upload and food selector
  merchant/page.tsx      Dining hall staff dashboard
  notifications/actions/ Notifications engine
  signup/page.tsx        Student registration
  student/page.tsx       Student marketplace
  page.tsx               Login page
  scripts/classify_meal.py  Local Ollama vision-model catalog matcher
  generated/prisma/      Generated Prisma Client (do not edit by hand)
lib/
  auth.ts                Database-backed session helpers and route guards
  chat-tools.ts          Assistant tool definitions and database queries
  ollama.ts              Local Ollama client with tool-calling loop
  password.ts            Password hashing and verification
  prisma.ts              Prisma client singleton
prisma/
  migrations/            Database migration history
  schema.prisma          DiningHall, Food, Listing, Order, User, and AuthSession models
  seed.ts                Destructive local demo-data seed
prisma7.config.ts        Prisma 7 schema, migration, seed, and datasource config
```


