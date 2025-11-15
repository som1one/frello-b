/*
  Warnings:

  - You are about to drop the column `date` on the `Meal` table. All the data in the column will be lost.
  - Added the required column `date` to the `MealPlan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Meal" DROP COLUMN "date";

-- AlterTable
ALTER TABLE "MealPlan" ADD COLUMN     "date" TIMESTAMP(3) NOT NULL;
