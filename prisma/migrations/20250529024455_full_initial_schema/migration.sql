-- CreateTable
CREATE TABLE "HomeBase" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "HomeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "homeBaseId" TEXT NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprinklerState" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "zone1" BOOLEAN NOT NULL DEFAULT false,
    "zone2" BOOLEAN NOT NULL DEFAULT false,
    "zone3" BOOLEAN NOT NULL DEFAULT false,
    "zone4" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SprinklerState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HomeBase_userId_key" ON "HomeBase"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SprinklerState_deviceId_key" ON "SprinklerState"("deviceId");

-- AddForeignKey
ALTER TABLE "HomeBase" ADD CONSTRAINT "HomeBase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_homeBaseId_fkey" FOREIGN KEY ("homeBaseId") REFERENCES "HomeBase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprinklerState" ADD CONSTRAINT "SprinklerState_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
