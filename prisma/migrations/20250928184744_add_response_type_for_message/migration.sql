-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('TEXT', 'MEAL_PLAN', 'REGENERATION_TEXT', 'REGENERATION_MEAL_PLAN', 'RECIPE');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "aiResponseType" "RequestType" NOT NULL DEFAULT 'TEXT';
