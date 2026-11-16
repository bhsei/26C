-- CreateEnum
CREATE TYPE "FoodCategory" AS ENUM ('COOKED_MEAT', 'COOKED_VEGETARIAN', 'FRESH_PRODUCE', 'BAKERY_DELI', 'DAIRY_BASED', 'MIXED_FOOD');

-- CreateEnum
CREATE TYPE "MetricBasis" AS ENUM ('MEASURED', 'ESTIMATED', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "Food" ADD COLUMN     "category" "FoodCategory",
ADD COLUMN     "unitWeightKg" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "EmissionFactor" (
    "id" TEXT NOT NULL,
    "category" "FoodCategory" NOT NULL,
    "co2ePerKg" DOUBLE PRECISION,
    "waterLPerKg" DOUBLE PRECISION,
    "landM2PerKg" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmissionFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpactRecord" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "diningHallId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "category" "FoodCategory",
    "emissionFactorId" TEXT,
    "methodVersion" TEXT NOT NULL,
    "mealsRescued" INTEGER NOT NULL,
    "kgDiverted" DOUBLE PRECISION,
    "kgDivertedBasis" "MetricBasis" NOT NULL,
    "co2AvoidedKg" DOUBLE PRECISION,
    "co2AvoidedBasis" "MetricBasis" NOT NULL,
    "waterSavedL" DOUBLE PRECISION,
    "waterSavedBasis" "MetricBasis" NOT NULL,
    "landSavedM2" DOUBLE PRECISION,
    "landSavedBasis" "MetricBasis" NOT NULL,
    "studentSavingsCents" INTEGER,
    "studentSavingsBasis" "MetricBasis" NOT NULL,
    "assumptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImpactRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmissionFactor_category_validFrom_idx" ON "EmissionFactor"("category", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "EmissionFactor_category_validFrom_key" ON "EmissionFactor"("category", "validFrom");

-- CreateIndex
CREATE INDEX "ImpactRecord_diningHallId_occurredAt_idx" ON "ImpactRecord"("diningHallId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImpactRecord_orderId_methodVersion_key" ON "ImpactRecord"("orderId", "methodVersion");

-- AddForeignKey
ALTER TABLE "ImpactRecord" ADD CONSTRAINT "ImpactRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactRecord" ADD CONSTRAINT "ImpactRecord_diningHallId_fkey" FOREIGN KEY ("diningHallId") REFERENCES "DiningHall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactRecord" ADD CONSTRAINT "ImpactRecord_emissionFactorId_fkey" FOREIGN KEY ("emissionFactorId") REFERENCES "EmissionFactor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
