/*
  Warnings:

  - Added the required column `date` to the `Meal` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Meal" ADD COLUMN     "date" TIMESTAMP(3) NOT NULL;
