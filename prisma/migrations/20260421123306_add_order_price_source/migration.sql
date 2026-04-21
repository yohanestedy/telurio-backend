-- CreateEnum
CREATE TYPE "OrderPriceSource" AS ENUM ('STANDARD', 'CUSTOM');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "priceSource" "OrderPriceSource";
