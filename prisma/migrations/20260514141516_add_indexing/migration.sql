-- CreateIndex
CREATE INDEX "Expense_coopId_deletedAt_date_idx" ON "Expense"("coopId", "deletedAt", "date");

-- CreateIndex
CREATE INDEX "GeneralExpense_ownerId_deletedAt_date_idx" ON "GeneralExpense"("ownerId", "deletedAt", "date");

-- CreateIndex
CREATE INDEX "Order_lifecycleStatus_deliveryStatus_deliveryDate_idx" ON "Order"("lifecycleStatus", "deliveryStatus", "deliveryDate");

-- CreateIndex
CREATE INDEX "ProductionRecord_coopId_deletedAt_date_idx" ON "ProductionRecord"("coopId", "deletedAt", "date");
