-- CreateTable
CREATE TABLE "GeneralExpenseCategory" (
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
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "GeneralExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneralExpense" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" UUID,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "GeneralExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneralExpenseCategory_ownerId_isActive_idx" ON "GeneralExpenseCategory"("ownerId", "isActive");

-- CreateIndex
CREATE INDEX "GeneralExpenseCategory_deletedAt_idx" ON "GeneralExpenseCategory"("deletedAt");

-- CreateIndex
CREATE INDEX "GeneralExpense_ownerId_date_idx" ON "GeneralExpense"("ownerId", "date");

-- CreateIndex
CREATE INDEX "GeneralExpense_categoryId_idx" ON "GeneralExpense"("categoryId");

-- CreateIndex
CREATE INDEX "GeneralExpense_deletedAt_idx" ON "GeneralExpense"("deletedAt");

-- AddForeignKey
ALTER TABLE "GeneralExpense" ADD CONSTRAINT "GeneralExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GeneralExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
