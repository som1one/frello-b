/*
  Warnings:

  - You are about to drop the column `days` on the `MealPlan` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');

-- AlterTable
ALTER TABLE "MealPlan" DROP COLUMN "days";

-- CreateTable
CREATE TABLE "Meal" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "type" "MealType" NOT NULL,
    "recipeName" TEXT NOT NULL,

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MealPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
