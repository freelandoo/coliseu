-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ENROLLED', 'FAILED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DeviceSyncStatus" AS ENUM ('IN_SYNC', 'PENDING', 'ERROR');

-- CreateEnum
CREATE TYPE "DeviceCommandStatus" AS ENUM ('PENDING', 'DISPATCHED', 'ACKNOWLEDGED', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('FACE', 'CARD', 'PIN');

-- CreateEnum
CREATE TYPE "AccessDeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "OverrideAction" AS ENUM ('ALLOW', 'BLOCK');

-- CreateTable
CREATE TABLE "AccessDevice" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lanHost" TEXT,
    "lanPort" INTEGER,
    "firmware" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'HYBRID',
    "status" "AccessDeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastHeartbeatAt" TIMESTAMP(3),
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessCredential" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "deviceRef" TEXT,
    "enrolledAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceUserMapping" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "syncStatus" "DeviceSyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "DeviceUserMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessPolicy" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "planId" TEXT,
    "graceDays" INTEGER NOT NULL DEFAULT 5,
    "maxEntriesPerDay" INTEGER,
    "timeZones" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessEvent" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "personId" TEXT,
    "unitId" TEXT NOT NULL,
    "deviceEventId" TEXT,
    "deviceTime" TIMESTAMP(3) NOT NULL,
    "serverTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "direction" TEXT NOT NULL DEFAULT 'ENTRY',
    "credentialType" TEXT,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "physicallyPassed" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'ONLINE',
    "deviceCursor" TEXT,

    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "status" "DeviceCommandStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT NOT NULL,
    "lastError" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "ackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceHeartbeat" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firmware" TEXT,
    "connectivity" TEXT,
    "clockDriftMs" INTEGER,

    CONSTRAINT "DeviceHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentSession" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" "CredentialType" NOT NULL DEFAULT 'FACE',
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultAt" TIMESTAMP(3),

    CONSTRAINT "EnrollmentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualAccessOverride" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "action" "OverrideAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualAccessOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessDevice_unitId_status_idx" ON "AccessDevice"("unitId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccessDevice_unitId_name_key" ON "AccessDevice"("unitId", "name");

-- CreateIndex
CREATE INDEX "AccessCredential_personId_type_idx" ON "AccessCredential"("personId", "type");

-- CreateIndex
CREATE INDEX "DeviceUserMapping_syncStatus_idx" ON "DeviceUserMapping"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceUserMapping_deviceId_externalUserId_key" ON "DeviceUserMapping"("deviceId", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceUserMapping_deviceId_personId_key" ON "DeviceUserMapping"("deviceId", "personId");

-- CreateIndex
CREATE INDEX "AccessPolicy_unitId_planId_idx" ON "AccessPolicy"("unitId", "planId");

-- CreateIndex
CREATE INDEX "AccessEvent_personId_deviceTime_idx" ON "AccessEvent"("personId", "deviceTime");

-- CreateIndex
CREATE INDEX "AccessEvent_unitId_serverTime_idx" ON "AccessEvent"("unitId", "serverTime");

-- CreateIndex
CREATE UNIQUE INDEX "AccessEvent_deviceId_deviceEventId_key" ON "AccessEvent"("deviceId", "deviceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCommand_dedupeKey_key" ON "DeviceCommand"("dedupeKey");

-- CreateIndex
CREATE INDEX "DeviceCommand_status_deviceId_idx" ON "DeviceCommand"("status", "deviceId");

-- CreateIndex
CREATE INDEX "DeviceHeartbeat_deviceId_at_idx" ON "DeviceHeartbeat"("deviceId", "at");

-- CreateIndex
CREATE INDEX "EnrollmentSession_status_idx" ON "EnrollmentSession"("status");

-- CreateIndex
CREATE INDEX "ManualAccessOverride_personId_expiresAt_idx" ON "ManualAccessOverride"("personId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_at_idx" ON "AuditLog"("entity", "entityId", "at");

-- AddForeignKey
ALTER TABLE "AccessDevice" ADD CONSTRAINT "AccessDevice_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessCredential" ADD CONSTRAINT "AccessCredential_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUserMapping" ADD CONSTRAINT "DeviceUserMapping_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUserMapping" ADD CONSTRAINT "DeviceUserMapping_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessPolicy" ADD CONSTRAINT "AccessPolicy_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessPolicy" ADD CONSTRAINT "AccessPolicy_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceHeartbeat" ADD CONSTRAINT "DeviceHeartbeat_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentSession" ADD CONSTRAINT "EnrollmentSession_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualAccessOverride" ADD CONSTRAINT "ManualAccessOverride_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
