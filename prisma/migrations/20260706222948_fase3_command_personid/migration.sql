-- AlterTable
ALTER TABLE "DeviceCommand" ADD COLUMN     "personId" TEXT;

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_personId_status_idx" ON "DeviceCommand"("deviceId", "personId", "status");
