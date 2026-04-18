-- CreateEnum
CREATE TYPE "StockMovementDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PRODUCTION_IN', 'PRODUCTION_CORRECTION_IN', 'PRODUCTION_CORRECTION_OUT', 'ALLOCATION_OUT', 'ALLOCATION_RELEASE', 'MANUAL_ADJUST_IN', 'MANUAL_ADJUST_OUT');

-- CreateEnum
CREATE TYPE "StockMovementSource" AS ENUM ('PRODUCTION_RECORD', 'ORDER_ALLOCATION', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "CoopStockBalance" (
    "coopId" UUID NOT NULL,
    "availableKg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoopStockBalance_pkey" PRIMARY KEY ("coopId")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "coopId" UUID NOT NULL,
    "movementDate" DATE NOT NULL,
    "movementType" "StockMovementType" NOT NULL,
    "direction" "StockMovementDirection" NOT NULL,
    "sourceType" "StockMovementSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "orderId" UUID,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoopStockBalance_availableKg_idx" ON "CoopStockBalance"("availableKg");

-- CreateIndex
CREATE INDEX "StockMovement_coopId_movementDate_idx" ON "StockMovement"("coopId", "movementDate");

-- CreateIndex
CREATE INDEX "StockMovement_movementType_movementDate_idx" ON "StockMovement"("movementType", "movementDate");

-- CreateIndex
CREATE INDEX "StockMovement_sourceType_sourceId_idx" ON "StockMovement"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");

-- AddForeignKey
ALTER TABLE "CoopStockBalance" ADD CONSTRAINT "CoopStockBalance_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
