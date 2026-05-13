-- CreateEnum
CREATE TYPE "CoopHealthRecordType" AS ENUM ('VITAMIN', 'VACCINE', 'MEDICINE');

-- CreateTable
CREATE TABLE "CoopHealthRecord" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "coopId" UUID NOT NULL,
    "type" "CoopHealthRecordType" NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "reminderDate" DATE,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" UUID,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "CoopHealthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoopHealthRecord_coopId_date_idx" ON "CoopHealthRecord"("coopId", "date");

-- CreateIndex
CREATE INDEX "CoopHealthRecord_date_idx" ON "CoopHealthRecord"("date");

-- CreateIndex
CREATE INDEX "CoopHealthRecord_type_idx" ON "CoopHealthRecord"("type");

-- CreateIndex
CREATE INDEX "CoopHealthRecord_deletedAt_idx" ON "CoopHealthRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "CoopHealthRecord_reminderEnabled_reminderDate_idx" ON "CoopHealthRecord"("reminderEnabled", "reminderDate");

-- AddForeignKey
ALTER TABLE "CoopHealthRecord" ADD CONSTRAINT "CoopHealthRecord_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
