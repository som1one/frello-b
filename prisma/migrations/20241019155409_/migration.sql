/*
  Warnings:

  - Added the required column `calories` to the `favorite_dish` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "favorite_dish" ADD COLUMN     "calories" DOUBLE PRECISION NOT NULL;
