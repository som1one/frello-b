/*
  Warnings:

  - A unique constraint covering the columns `[dishId]` on the table `Message` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "dishId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Message_dishId_key" ON "Message"("dishId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;
