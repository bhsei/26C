ALTER TABLE "Order"
ADD COLUMN "refundedAt" TIMESTAMP(3),
ADD COLUMN "refundAmountCents" INTEGER;
