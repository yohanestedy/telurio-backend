-- CreateEnum
CREATE TYPE "CoopPopulationChangeType" AS ENUM ('INITIAL', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "ProductionRecord" ADD COLUMN "populationSnapshot" INTEGER;

-- CreateTable
CREATE TABLE "CoopPopulationHistory" (
    "id" UUID NOT NULL,
    "coopId" UUID NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "previousPopulation" INTEGER,
    "newPopulation" INTEGER NOT NULL,
    "deltaPopulation" INTEGER NOT NULL,
    "changeType" "CoopPopulationChangeType" NOT NULL DEFAULT 'ADJUSTMENT',
    "reason" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoopPopulationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoopPopulationHistory_coopId_effectiveDate_idx" ON "CoopPopulationHistory"("coopId", "effectiveDate");

-- CreateIndex
CREATE INDEX "CoopPopulationHistory_effectiveDate_idx" ON "CoopPopulationHistory"("effectiveDate");

-- AddForeignKey
ALTER TABLE "CoopPopulationHistory" ADD CONSTRAINT "CoopPopulationHistory_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
