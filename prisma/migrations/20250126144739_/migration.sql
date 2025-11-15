/*
  Warnings:

  - You are about to drop the column `planId` on the `Message` table. All the data in the column will be lost.
  - Added the required column `messageId` to the `MealPlan` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_planId_fkey";

-- DropIndex
DROP INDEX "Message_planId_key";

-- AlterTable
ALTER TABLE "MealPlan" ADD COLUMN     "messageId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "planId";

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
