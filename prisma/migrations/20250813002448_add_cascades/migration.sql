-- DropForeignKey
ALTER TABLE "Device" DROP CONSTRAINT "Device_homeBaseId_fkey";

-- DropForeignKey
ALTER TABLE "Schedule" DROP CONSTRAINT "Schedule_deviceId_fkey";

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_homeBaseId_fkey" FOREIGN KEY ("homeBaseId") REFERENCES "HomeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
