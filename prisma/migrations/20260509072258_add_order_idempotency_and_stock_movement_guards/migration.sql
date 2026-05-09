/*
  Warnings:

  - A unique constraint covering the columns `[createdById,idempotencyKey]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sourceType,sourceId,movementType,direction]` on the table `StockMovement` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_createdById_idempotencyKey_key" ON "Order"("createdById", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_sourceType_sourceId_movementType_direction_key" ON "StockMovement"("sourceType", "sourceId", "movementType", "direction");
