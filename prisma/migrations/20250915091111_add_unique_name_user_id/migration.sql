/*
  Warnings:

  - A unique constraint covering the columns `[name,user_id]` on the table `dish` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "dish_name_user_id_key" ON "dish"("name", "user_id");
