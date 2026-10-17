/*
  Warnings:

  - You are about to drop the column `allergens` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Listing` table. All the data in the column will be lost.
  - You are about to drop the `_FollowedDiningHalls` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `foodId` to the `Listing` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Allergen" AS ENUM ('GLUTEN', 'MILK', 'EGGS', 'FISH', 'SHELLFISH', 'TREE_NUTS', 'PEANUTS', 'WHEAT', 'SOY', 'SESAME');

-- DropForeignKey
ALTER TABLE "_FollowedDiningHalls" DROP CONSTRAINT "_FollowedDiningHalls_A_fkey";

-- DropForeignKey
ALTER TABLE "_FollowedDiningHalls" DROP CONSTRAINT "_FollowedDiningHalls_B_fkey";

-- AlterTable
ALTER TABLE "Listing" DROP COLUMN "allergens",
DROP COLUMN "description",
DROP COLUMN "title",
ADD COLUMN     "foodId" TEXT NOT NULL;

-- DropTable
DROP TABLE "_FollowedDiningHalls";

-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "allergens" "Allergen"[] DEFAULT ARRAY[]::"Allergen"[],

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
