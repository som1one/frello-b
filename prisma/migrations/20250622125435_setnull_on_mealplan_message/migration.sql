-- DropForeignKey
ALTER TABLE "MealPlan" DROP CONSTRAINT "MealPlan_messageId_fkey";

-- AlterTable
ALTER TABLE "MealPlan" ALTER COLUMN "messageId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
