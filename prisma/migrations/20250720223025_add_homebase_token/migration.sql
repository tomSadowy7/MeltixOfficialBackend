/*
  Warnings:

  - A unique constraint covering the columns `[homebaseToken]` on the table `HomeBase` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "HomeBase" ADD COLUMN     "homebaseToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "HomeBase_homebaseToken_key" ON "HomeBase"("homebaseToken");
