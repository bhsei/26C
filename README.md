# Create the project
pnpm create next-app@latest secondhelping --typescript --tailwind --app --prisma
cd secondhelping

# Start POSGRESQL
docker compose up -d

# Start service
pnpm dev

# Prisma schema with three models: Merchant, Listing, Order.
prisma migrate dev