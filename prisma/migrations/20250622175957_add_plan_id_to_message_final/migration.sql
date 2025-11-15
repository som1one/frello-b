/*
  Warnings:

  - You are about to drop the column `messageId` on the `MealPlan` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "MealPlan" DROP CONSTRAINT "MealPlan_messageId_fkey";

-- AlterTable
ALTER TABLE "MealPlan" DROP COLUMN "messageId";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "planId" INTEGER;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MealPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
