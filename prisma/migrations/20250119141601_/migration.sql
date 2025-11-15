/*
  Warnings:

  - You are about to drop the `big_favorite_plan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `card_plan` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `small_favorite_plan` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "big_favorite_plan" DROP CONSTRAINT "big_favorite_plan_user_id_fkey";

-- DropForeignKey
ALTER TABLE "card_plan" DROP CONSTRAINT "card_plan_big_favorite_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "dishes" DROP CONSTRAINT "dishes_card_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "dishes" DROP CONSTRAINT "dishes_small_favorite_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "small_favorite_plan" DROP CONSTRAINT "small_favorite_plan_user_id_fkey";

-- DropTable
DROP TABLE "big_favorite_plan";

-- DropTable
DROP TABLE "card_plan";

-- DropTable
DROP TABLE "small_favorite_plan";

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "days" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MealPlan_userId_key" ON "MealPlan"("userId");

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
