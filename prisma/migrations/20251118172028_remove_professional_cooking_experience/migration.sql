/*
  Warnings:

  - The values [PROFESSIONAL] on the enum `CookingExperience` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CookingExperience_new" AS ENUM ('BEGINNER', 'OCCASIONAL', 'REGULAR', 'EXPERIENCED');
ALTER TABLE "user" ALTER COLUMN "cooking_experience" TYPE "CookingExperience_new" USING ("cooking_experience"::text::"CookingExperience_new");
ALTER TYPE "CookingExperience" RENAME TO "CookingExperience_old";
ALTER TYPE "CookingExperience_new" RENAME TO "CookingExperience";
DROP TYPE "CookingExperience_old";
COMMIT;
