/*
  Warnings:

  - You are about to drop the `dishes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `favorite_dish` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "favorite_dish" DROP CONSTRAINT "favorite_dish_user_id_fkey";

-- DropTable
DROP TABLE "dishes";

-- DropTable
DROP TABLE "favorite_dish";

-- CreateTable
CREATE TABLE "dish" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "ingredients" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "proteins" DOUBLE PRECISION,
    "fats" DOUBLE PRECISION NOT NULL,
    "carbs" DOUBLE PRECISION NOT NULL,
    "cooking_time" INTEGER NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "dish_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "dish" ADD CONSTRAINT "dish_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
