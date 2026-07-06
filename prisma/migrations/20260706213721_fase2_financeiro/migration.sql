-- CreateEnum
CREATE TYPE "WebhookProcessState" AS ENUM ('PENDING', 'PROCESSED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'REFUNDED', 'CHARGEBACK', 'CANCELED');

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "asaasEventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "paymentId" TEXT,
    "payload" JSONB NOT NULL,
    "processState" "WebhookProcessState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "eventAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCustomer" (
    "id" TEXT NOT NULL,
    "asaasCustomerId" TEXT NOT NULL,
    "externalReference" TEXT,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "asaasSubscriptionId" TEXT NOT NULL,
    "externalReference" TEXT,
    "customerId" TEXT NOT NULL,
    "cycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "value" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "asaasPaymentId" TEXT NOT NULL,
    "externalReference" TEXT,
    "subscriptionId" TEXT,
    "billingType" TEXT NOT NULL DEFAULT 'UNDEFINED',
    "value" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "invoiceUrl" TEXT,
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_asaasEventId_key" ON "WebhookEvent"("asaasEventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_processState_receivedAt_idx" ON "WebhookEvent"("processState", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_paymentId_idx" ON "WebhookEvent"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_asaasCustomerId_key" ON "BillingCustomer"("asaasCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCustomer_personId_key" ON "BillingCustomer"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_asaasSubscriptionId_key" ON "BillingSubscription"("asaasSubscriptionId");

-- CreateIndex
CREATE INDEX "BillingSubscription_customerId_idx" ON "BillingSubscription"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_asaasPaymentId_key" ON "Payment"("asaasPaymentId");

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_dueDate_idx" ON "Payment"("subscriptionId", "dueDate");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- AddForeignKey
ALTER TABLE "BillingCustomer" ADD CONSTRAINT "BillingCustomer_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "BillingCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
