/*
  Warnings:

  - You are about to drop the column `userId` on the `PromoCode` table. All the data in the column will be lost.
  - You are about to drop the column `promoCodeId` on the `user` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "PromoCode" DROP CONSTRAINT "PromoCode_userId_fkey";

-- DropIndex
DROP INDEX "PromoCode_userId_key";

-- DropIndex
DROP INDEX "user_promoCodeId_key";

-- AlterTable
ALTER TABLE "PromoCode" DROP COLUMN "userId",
ADD COLUMN     "currentUses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isUnlimited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxUses" INTEGER,
ADD COLUMN     "validFrom" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user" DROP COLUMN "promoCodeId";

-- CreateTable
CREATE TABLE "PromoCodeUsage" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "promoCodeId" INTEGER NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromoCodeUsage_promoCodeId_idx" ON "PromoCodeUsage"("promoCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCodeUsage_userId_promoCodeId_key" ON "PromoCodeUsage"("userId", "promoCodeId");

-- CreateIndex
CREATE INDEX "PromoCode_code_idx" ON "PromoCode"("code");

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
