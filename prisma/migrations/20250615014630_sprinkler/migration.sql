/*
  Warnings:

  - The primary key for the `SprinklerState` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `SprinklerState` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "SprinklerState" DROP CONSTRAINT "SprinklerState_deviceId_fkey";

-- DropIndex
DROP INDEX "SprinklerState_deviceId_key";

-- AlterTable
ALTER TABLE "SprinklerState" DROP CONSTRAINT "SprinklerState_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "SprinklerState_pkey" PRIMARY KEY ("deviceId");

-- AddForeignKey
ALTER TABLE "SprinklerState" ADD CONSTRAINT "SprinklerState_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
