-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OWNER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "OrderLifecycleStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('BELUM_DIHANTAR', 'SEDANG_DIHANTAR', 'SUDAH_DIHANTAR');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('BELUM_BAYAR', 'DP', 'LUNAS');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('CREATE', 'UPDATE', 'STATUS_CHANGE', 'CORRECTION', 'ACTIVATE', 'DEACTIVATE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "updatedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coop" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "population" INTEGER NOT NULL,
    "chickenStrain" TEXT,
    "chickBirthDate" TIMESTAMP(3),
    "depreciationPercent" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "updatedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCoopAccess" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "coopId" UUID NOT NULL,
    "ownershipSharePercent" DECIMAL(5,2),
    "createdById" UUID,
    "updatedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCoopAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRecord" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "coopId" UUID NOT NULL,
    "collectionTime" TEXT NOT NULL,
    "goodKg" DECIMAL(12,3) NOT NULL,
    "goodCount" INTEGER NOT NULL,
    "brokenCount" INTEGER,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EggPrice" (
    "id" UUID NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "pricePerKg" BIGINT NOT NULL,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EggPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "pricePerKg" BIGINT,
    "totalInvoice" BIGINT,
    "deliveryDate" DATE NOT NULL,
    "deliverBefore" TEXT,
    "lifecycleStatus" "OrderLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'BELUM_DIHANTAR',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'BELUM_BAYAR',
    "paymentMethod" "PaymentMethod",
    "dpAmount" BIGINT,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "startedById" UUID,
    "deliveredById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelReason" TEXT,
    "cancelNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSourceAllocation" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "coopId" UUID NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "assignedById" UUID NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSourceAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentHistory" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL,
    "paymentMethod" "PaymentMethod",
    "amountPaid" BIGINT,
    "notes" TEXT,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "updatedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "coopId" UUID NOT NULL,
    "expenseCategoryId" UUID,
    "categoryLabel" TEXT NOT NULL,
    "description" TEXT,
    "amount" BIGINT NOT NULL,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "actionType" "AuditActionType" NOT NULL,
    "actorUserId" UUID NOT NULL,
    "actorName" TEXT,
    "coopId" UUID,
    "summary" TEXT,
    "beforeDataJson" JSONB,
    "afterDataJson" JSONB,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "Coop_isActive_idx" ON "Coop"("isActive");

-- CreateIndex
CREATE INDEX "Coop_deletedAt_idx" ON "Coop"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coop_name_key" ON "Coop"("name");

-- CreateIndex
CREATE INDEX "UserCoopAccess_coopId_deletedAt_idx" ON "UserCoopAccess"("coopId", "deletedAt");

-- CreateIndex
CREATE INDEX "UserCoopAccess_userId_deletedAt_idx" ON "UserCoopAccess"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserCoopAccess_userId_coopId_key" ON "UserCoopAccess"("userId", "coopId");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_deletedAt_idx" ON "Customer"("deletedAt");

-- CreateIndex
CREATE INDEX "ProductionRecord_coopId_date_idx" ON "ProductionRecord"("coopId", "date");

-- CreateIndex
CREATE INDEX "ProductionRecord_deletedAt_idx" ON "ProductionRecord"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRecord_date_coopId_collectionTime_key" ON "ProductionRecord"("date", "coopId", "collectionTime");

-- CreateIndex
CREATE INDEX "EggPrice_deletedAt_idx" ON "EggPrice"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EggPrice_effectiveDate_key" ON "EggPrice"("effectiveDate");

-- CreateIndex
CREATE INDEX "Order_deliveryDate_lifecycleStatus_deliveryStatus_idx" ON "Order"("deliveryDate", "lifecycleStatus", "deliveryStatus");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "OrderSourceAllocation_orderId_idx" ON "OrderSourceAllocation"("orderId");

-- CreateIndex
CREATE INDEX "OrderSourceAllocation_coopId_idx" ON "OrderSourceAllocation"("coopId");

-- CreateIndex
CREATE INDEX "PaymentHistory_orderId_createdAt_idx" ON "PaymentHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "ExpenseCategory_ownerId_isActive_idx" ON "ExpenseCategory"("ownerId", "isActive");

-- CreateIndex
CREATE INDEX "ExpenseCategory_deletedAt_idx" ON "ExpenseCategory"("deletedAt");

-- CreateIndex
CREATE INDEX "Expense_coopId_date_idx" ON "Expense"("coopId", "date");

-- CreateIndex
CREATE INDEX "Expense_expenseCategoryId_idx" ON "Expense"("expenseCategoryId");

-- CreateIndex
CREATE INDEX "Expense_deletedAt_idx" ON "Expense"("deletedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_coopId_createdAt_idx" ON "AuditLog"("coopId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserCoopAccess" ADD CONSTRAINT "UserCoopAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoopAccess" ADD CONSTRAINT "UserCoopAccess_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRecord" ADD CONSTRAINT "ProductionRecord_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSourceAllocation" ADD CONSTRAINT "OrderSourceAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSourceAllocation" ADD CONSTRAINT "OrderSourceAllocation_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentHistory" ADD CONSTRAINT "PaymentHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
