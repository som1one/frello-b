/*
  Warnings:

  - Added the required column `carbs` to the `favorite_dish` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cooking_time` to the `favorite_dish` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fats` to the `favorite_dish` table without a default value. This is not possible if the table is not empty.
  - Added the required column `proteins` to the `favorite_dish` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "favorite_dish" ADD COLUMN     "carbs" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "cooking_time" INTEGER NOT NULL,
ADD COLUMN     "fats" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "proteins" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "image" DROP NOT NULL;
