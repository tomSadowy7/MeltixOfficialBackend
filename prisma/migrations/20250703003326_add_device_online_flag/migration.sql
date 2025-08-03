-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "lastPingAt" TIMESTAMP(3),
ADD COLUMN     "online" BOOLEAN NOT NULL DEFAULT false;
