/*
  Warnings:

  - You are about to drop the column `dow` on the `ScheduleSlot` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "ScheduleSlot_dow_startBucket_idx";

-- AlterTable
ALTER TABLE "ScheduleSlot" DROP COLUMN "dow",
ADD COLUMN     "days" INTEGER[];

-- CreateIndex
CREATE INDEX "ScheduleSlot_startBucket_idx" ON "ScheduleSlot"("startBucket");
