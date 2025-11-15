/*
  Warnings:

  - You are about to drop the column `chat_requests_count` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `trial_requests_used` on the `user` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "user" DROP COLUMN "chat_requests_count",
DROP COLUMN "trial_requests_used",
ADD COLUMN     "last_request_date" TIMESTAMP(3),
ADD COLUMN     "trial_day_requests" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trial_start_date" TIMESTAMP(3);
