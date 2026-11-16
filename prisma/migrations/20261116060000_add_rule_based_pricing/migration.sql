ALTER TABLE "Listing"
ADD COLUMN "autoPricingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastAutoPriceReviewAt" TIMESTAMP(3),
ADD COLUMN "lastAutoPriceReason" TEXT;
