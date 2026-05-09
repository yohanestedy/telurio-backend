/*
  Safe migration for existing data:
  - Adds idempotency columns as nullable so old rows remain valid.
  - Adds normalized category columns as nullable first.
  - Backfills normalizedName from current name using the same normalization shape as app code.
  - Fails explicitly if normalized duplicates already exist for the same owner.
  - Enforces NOT NULL and unique constraints only after backfill succeeds.
*/

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "ExpenseCategory" ADD COLUMN "normalizedName" TEXT;

-- AlterTable
ALTER TABLE "GeneralExpense" ADD COLUMN "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "GeneralExpenseCategory" ADD COLUMN "normalizedName" TEXT;

-- Backfill normalized names for existing data.
UPDATE "ExpenseCategory"
SET "normalizedName" = lower(regexp_replace(btrim("name"), '\\s+', ' ', 'g'))
WHERE "normalizedName" IS NULL;

UPDATE "GeneralExpenseCategory"
SET "normalizedName" = lower(regexp_replace(btrim("name"), '\\s+', ' ', 'g'))
WHERE "normalizedName" IS NULL;

-- Fail safely if historical data has duplicates after normalization.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ExpenseCategory"
    GROUP BY "ownerId", "normalizedName"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate normalized ExpenseCategory names exist for the same owner. Rename duplicates before applying this migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "GeneralExpenseCategory"
    GROUP BY "ownerId", "normalizedName"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate normalized GeneralExpenseCategory names exist for the same owner. Rename duplicates before applying this migration.';
  END IF;
END $$;

-- Enforce required normalized fields after backfill.
ALTER TABLE "ExpenseCategory" ALTER COLUMN "normalizedName" SET NOT NULL;
ALTER TABLE "GeneralExpenseCategory" ALTER COLUMN "normalizedName" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_createdById_idempotencyKey_key" ON "Customer"("createdById", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_createdById_idempotencyKey_key" ON "Expense"("createdById", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_ownerId_normalizedName_key" ON "ExpenseCategory"("ownerId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "GeneralExpense_createdById_idempotencyKey_key" ON "GeneralExpense"("createdById", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "GeneralExpenseCategory_ownerId_normalizedName_key" ON "GeneralExpenseCategory"("ownerId", "normalizedName");
