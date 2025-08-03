-- CreateEnum
CREATE TYPE "RunSource" AS ENUM ('SCHEDULE', 'MANUAL', 'RAIN_GUARD');

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rainGuard" BOOLEAN NOT NULL DEFAULT false,
    "deviceId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleSlot" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "dow" INTEGER NOT NULL,
    "startBucket" INTEGER NOT NULL,
    "bucketCount" INTEGER NOT NULL,
    "zoneMask" INTEGER NOT NULL,

    CONSTRAINT "ScheduleSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunHistory" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "zoneMask" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "source" "RunSource" NOT NULL,
    "scheduleId" TEXT,

    CONSTRAINT "RunHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleSlot_dow_startBucket_idx" ON "ScheduleSlot"("dow", "startBucket");

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleSlot" ADD CONSTRAINT "ScheduleSlot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
