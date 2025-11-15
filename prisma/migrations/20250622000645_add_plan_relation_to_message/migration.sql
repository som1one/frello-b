/*
  Warnings:

  - A unique constraint covering the columns `[messageId]` on the table `MealPlan` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_messageId_key" ON "MealPlan"("messageId");
