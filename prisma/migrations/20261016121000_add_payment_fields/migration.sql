ALTER TABLE "Order"
ADD COLUMN "paymentRef" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3);

UPDATE "Order"
SET "paymentRef" = 'legacy_' || "id"
WHERE "paymentRef" IS NULL;

ALTER TABLE "Order"
ALTER COLUMN "paymentRef" SET NOT NULL,
ALTER COLUMN "pickupCode" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';

CREATE UNIQUE INDEX "Order_paymentRef_key" ON "Order"("paymentRef");
