/*
  Warnings:

  - A unique constraint covering the columns `[planId]` on the table `Message` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "planId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Message_planId_key" ON "Message"("planId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MealPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
