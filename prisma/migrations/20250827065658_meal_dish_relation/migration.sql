-- AlterTable
ALTER TABLE "Meal" ADD COLUMN     "dish_id" INTEGER;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;
