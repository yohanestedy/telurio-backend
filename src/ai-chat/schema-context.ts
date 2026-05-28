export const SCHEMA_CONTEXT = `## Struktur Data Telurio

Berikut adalah ringkasan lengkap struktur data sistem (Prisma schema). Gunakan informasi ini untuk memahami enum values, nama field, relasi, dan constraint saat memanggil tools, dan untuk memberikan jawaban yang lebih akurat. Akses data tetap dibatasi sesuai role user — meskipun struktur diketahui, data hanya bisa diambil melalui tools yang diizinkan.

---

## Konvensi Umum

- **Soft delete**: hampir semua model punya field \`deletedAt\`, \`deletedById\`, \`deleteReason\`. Record yang \`deletedAt != null\` dianggap terhapus.
- **Audit fields**: \`createdById\`, \`updatedById\`, \`createdAt\`, \`updatedAt\` ada di sebagian besar model.
- **Idempotency**: model \`Order\`, \`Customer\`, \`Expense\`, \`GeneralExpense\` punya \`idempotencyKey\` (unik per \`createdById\`) untuk mencegah duplikasi submit.
- **Tipe Rupiah**: pakai \`BigInt\` (\`pricePerKg\`, \`totalInvoice\`, \`dpAmount\`, \`amount\`, \`amountPaid\`).
- **Tipe kg**: pakai \`Decimal(12,3)\` (\`quantityKg\`, \`goodKg\`, \`availableKg\`).
- **Persen**: pakai \`Decimal(5,2)\` (\`ownershipSharePercent\`, \`depreciationPercent\`).
- **ID**: semua primary key bertipe UUID.
- **Tanggal**: \`@db.Date\` untuk tanggal saja (tanpa jam), \`DateTime\` untuk timestamp.

---

## Enums

### Role
\`ADMIN\` | \`OWNER\` | \`OPERATOR\`

### OrderLifecycleStatus
\`ACTIVE\` | \`CANCELLED\`

### DeliveryStatus
\`BELUM_DIHANTAR\` | \`SEDANG_DIHANTAR\` | \`SUDAH_DIHANTAR\`

### PaymentStatus
\`BELUM_BAYAR\` | \`DP\` | \`LUNAS\`

### PaymentMethod
\`CASH\` | \`TRANSFER\`

### OrderPriceSource
\`STANDARD\` (dari harga harian) | \`CUSTOM\` (override manual)

### StockMovementDirection
\`IN\` | \`OUT\`

### StockMovementType
- \`PRODUCTION_IN\`: input produksi telur
- \`PRODUCTION_CORRECTION_IN\`: koreksi tambah produksi
- \`PRODUCTION_CORRECTION_OUT\`: koreksi kurang produksi
- \`ALLOCATION_OUT\`: alokasi keluar untuk order
- \`ALLOCATION_RELEASE\`: rilis alokasi (saat order dibatalkan, stok kembali)
- \`MANUAL_ADJUST_IN\`: penyesuaian manual masuk
- \`MANUAL_ADJUST_OUT\`: penyesuaian manual keluar

### StockMovementSource
\`PRODUCTION_RECORD\` | \`ORDER_ALLOCATION\` | \`MANUAL_ADJUSTMENT\`

### AuditActionType
\`CREATE\` | \`UPDATE\` | \`STATUS_CHANGE\` | \`CORRECTION\` | \`ACTIVATE\` | \`DEACTIVATE\`

### CoopPopulationChangeType
\`INITIAL\` (populasi awal) | \`ADJUSTMENT\` (penyesuaian)

### CoopHealthRecordType
\`VITAMIN\` | \`VACCINE\` | \`MEDICINE\`

---

## Models

### User
Pengguna sistem.
- \`id\` (UUID, PK), \`name\`, \`username\` (unik), \`passwordHash\`
- \`role\`: Role enum
- \`isActive\`: boolean (default true)
- Audit: \`createdById\`, \`updatedById\`, \`deletedAt\`, \`deletedById\`, \`deleteReason\`, \`createdAt\`, \`updatedAt\`
- Relasi: \`coopAccesses\` (UserCoopAccess[]), \`ownedExpenseCategories\` (ExpenseCategory[]), \`sessions\` (UserSession[])
- Index: [role, isActive], [deletedAt]

### UserSession
Sesi login user (refresh token, device tracking).
- \`id\` (UUID, PK), \`userId\`, \`sessionId\` (unik), \`refreshTokenHash\`
- \`deviceLabel\`, \`ipAddress\`, \`userAgent\` (opsional)
- \`expiresAt\`, \`revokedAt\`, \`lastUsedAt\`, \`createdAt\`, \`updatedAt\`
- Index: [userId, revokedAt], [expiresAt]

### Coop
Kandang ayam petelur.
- \`id\` (UUID, PK), \`name\` (unik), \`population\` (Int — jumlah ayam saat ini)
- \`chickenStrain\` (opsional — strain ayam, mis. "Lohmann Brown")
- \`chickBirthDate\` (opsional — tanggal lahir ayam)
- \`depreciationPercent\` (Decimal 5,2, default 15)
- \`isActive\`: boolean (default true)
- Audit lengkap (createdById, updatedById, deletedAt, dst.)
- Relasi: \`userAccesses\`, \`productionRecords\`, \`orderAllocations\`, \`expenses\`, \`stockBalance\`, \`stockMovements\`, \`populationHistories\`, \`healthRecords\`
- Constraint: \`@@unique([name])\`
- Index: [isActive], [deletedAt]

### CoopPopulationHistory
Riwayat perubahan populasi kandang.
- \`id\` (UUID, PK), \`coopId\`, \`effectiveDate\` (Date)
- \`previousPopulation\` (Int, opsional), \`newPopulation\` (Int), \`deltaPopulation\` (Int)
- \`changeType\`: CoopPopulationChangeType (default ADJUSTMENT)
- \`reason\` (opsional), \`createdById\`, \`createdAt\`
- Index: [coopId, effectiveDate], [effectiveDate]

### UserCoopAccess
Akses user ke kandang dan persentase kepemilikan.
- \`id\` (UUID, PK), \`userId\`, \`coopId\`
- \`ownershipSharePercent\` (Decimal 5,2, opsional)
- Audit lengkap
- Constraint: \`@@unique([userId, coopId])\`
- Index: [coopId, deletedAt], [userId, deletedAt]

### Customer
Pelanggan pembeli telur.
- \`id\` (UUID, PK), \`name\`, \`address\` (opsional), \`phone\` (opsional)
- \`idempotencyKey\` (opsional)
- Audit lengkap
- Relasi: \`orders\` (Order[])
- Constraint: \`@@unique([createdById, idempotencyKey])\`
- Index: [name], [phone], [deletedAt]

### ProductionRecord
Catatan produksi telur per kandang per sesi koleksi.
- \`id\` (UUID, PK), \`date\` (Date), \`coopId\`, \`collectionTime\` (string — sesi koleksi, mis. "PAGI", "SORE")
- \`goodKg\` (Decimal 12,3), \`goodCount\` (Int), \`brokenCount\` (Int, opsional)
- \`populationSnapshot\` (Int, opsional — populasi saat input)
- \`notes\` (opsional)
- Audit lengkap
- Constraint: \`@@unique([date, coopId, collectionTime])\` (1 sesi per kandang per hari)
- Index: [coopId, date], [coopId, deletedAt, date], [deletedAt]

### CoopHealthRecord
Catatan kesehatan kandang (vitamin, vaksin, obat).
- \`id\` (UUID, PK), \`date\` (Date), \`coopId\`
- \`type\`: CoopHealthRecordType, \`description\`
- \`notes\` (opsional)
- \`reminderDate\` (Date, opsional), \`reminderEnabled\` (default false)
- \`completedAt\`, \`completedById\` (opsional)
- Audit lengkap
- Index: [coopId, date], [date], [type], [deletedAt], [reminderEnabled, reminderDate]

### EggPrice
Harga telur per kg per tanggal efektif.
- \`id\` (UUID, PK), \`effectiveDate\` (Date, unik), \`pricePerKg\` (BigInt — Rupiah)
- \`notes\` (opsional)
- Audit lengkap
- Index: [deletedAt]

### Order
Pesanan telur dari customer.
- \`id\` (UUID, PK), \`customerId\`
- \`quantityKg\` (Decimal 12,3 — jumlah kg pesanan)
- \`pricePerKg\` (BigInt, opsional — terkunci saat \`Hantar\` ditekan; bisa null sampai harga tanggal kirim tersedia)
- \`priceSource\`: OrderPriceSource (opsional — STANDARD dari harga harian, CUSTOM override manual)
- \`totalInvoice\` (BigInt, opsional — quantityKg × pricePerKg, round-half-up ke Rupiah)
- \`deliveryDate\` (Date — tanggal kirim; tanggal lampau diperbolehkan untuk input historis tapi non-editable setelah dibuat)
- \`deliverBefore\` (string, opsional — jam target kirim)
- \`lifecycleStatus\`: OrderLifecycleStatus (default ACTIVE)
- \`deliveryStatus\`: DeliveryStatus (default BELUM_DIHANTAR)
- \`paymentStatus\`: PaymentStatus (default BELUM_BAYAR)
- \`paymentMethod\`: PaymentMethod (opsional)
- \`dpAmount\` (BigInt, opsional — MVP hanya 1 DP per order; null bila status BELUM_BAYAR atau LUNAS tanpa riwayat DP)
- \`notes\` (opsional), \`idempotencyKey\` (opsional)
- \`createdById\`, \`updatedById\`
- \`startedById\` (opsional — user yang menekan \`Hantar\`)
- \`deliveredById\` (opsional — user yang menyelesaikan pengantaran)
- \`cancelledAt\`, \`cancelledById\`, \`cancelReason\`, \`cancelNotes\` (opsional — terisi saat dibatalkan)
- \`createdAt\`, \`updatedAt\`
- Relasi: \`customer\`, \`allocations\` (OrderSourceAllocation[]), \`paymentHistories\`, \`stockMovements\`
- Constraint: \`@@unique([createdById, idempotencyKey])\`
- Index: [deliveryDate, lifecycleStatus, deliveryStatus], [lifecycleStatus, deliveryStatus, deliveryDate], [paymentStatus], [customerId]

### CoopStockBalance
Saldo stok telur live per kandang (1 row per coop).
- \`coopId\` (UUID, PK), \`availableKg\` (Decimal 12,3, default 0)
- \`updatedAt\` (auto)
- Index: [availableKg]

### StockMovement
Setiap pergerakan stok (immutable ledger).
- \`id\` (UUID, PK), \`coopId\`, \`movementDate\` (Date)
- \`movementType\`: StockMovementType, \`direction\`: StockMovementDirection
- \`sourceType\`: StockMovementSource, \`sourceId\` (string — ID dari production record / order / manual adjustment)
- \`orderId\` (UUID, opsional — terkait jika alokasi)
- \`quantityKg\` (Decimal 12,3)
- \`notes\` (opsional), \`createdById\`, \`createdAt\`
- Constraint: \`@@unique([sourceType, sourceId, movementType, direction])\` (cegah duplikat)
- Index: [coopId, movementDate], [movementType, movementDate], [sourceType, sourceId], [orderId]

### OrderSourceAllocation
Alokasi stok dari kandang tertentu ke order tertentu (1 order bisa ditarik dari banyak kandang).
- \`id\` (UUID, PK), \`orderId\`, \`coopId\`, \`quantityKg\` (Decimal 12,3)
- \`assignedById\`, \`updatedById\` (opsional), \`createdAt\`, \`updatedAt\`
- Index: [orderId], [coopId]

### PaymentHistory
Riwayat update pembayaran order (bukan saldo kumulatif).
- \`id\` (UUID, PK), \`orderId\`, \`paymentStatus\`: PaymentStatus
- \`paymentMethod\`: PaymentMethod (opsional)
- \`amountPaid\` (BigInt, opsional — jumlah transaksi saat update ini)
- \`notes\` (opsional), \`updatedById\`, \`createdAt\`
- Index: [orderId, createdAt]

### ExpenseCategory
Kategori pengeluaran per kandang, dimiliki per user.
- \`id\` (UUID, PK), \`ownerId\` (User), \`name\`, \`normalizedName\` (untuk dedup)
- \`isActive\`: boolean (default true)
- Audit lengkap
- Relasi: \`owner\` (User), \`expenses\` (Expense[])
- Constraint: \`@@unique([ownerId, normalizedName])\`
- Index: [ownerId, isActive], [deletedAt]

### Expense
Pengeluaran spesifik per kandang.
- \`id\` (UUID, PK), \`date\` (Date), \`coopId\`, \`expenseCategoryId\` (opsional)
- \`description\` (opsional), \`amount\` (BigInt — Rupiah)
- \`notes\` (opsional), \`idempotencyKey\` (opsional)
- Audit lengkap
- Constraint: \`@@unique([createdById, idempotencyKey])\`
- Index: [coopId, date], [coopId, deletedAt, date], [expenseCategoryId], [deletedAt]

### AuditLog
Log audit perubahan entitas (immutable).
- \`id\` (UUID, PK), \`entityType\` (string), \`entityId\` (UUID)
- \`actionType\`: AuditActionType
- \`actorUserId\`, \`actorName\` (opsional)
- \`coopId\` (opsional)
- \`summary\` (opsional)
- \`beforeDataJson\`, \`afterDataJson\`, \`metadataJson\` (Json, opsional)
- \`createdAt\`
- Index: [entityType, entityId, createdAt], [actorUserId, createdAt], [coopId, createdAt]

### GeneralExpenseCategory
Kategori pengeluaran umum (tidak terikat kandang), dimiliki per user.
- \`id\` (UUID, PK), \`ownerId\`, \`name\`, \`normalizedName\`
- \`isActive\`: boolean (default true)
- Audit lengkap
- Relasi: \`expenses\` (GeneralExpense[])
- Constraint: \`@@unique([ownerId, normalizedName])\`
- Index: [ownerId, isActive], [deletedAt]

### GeneralExpense
Pengeluaran umum (tidak per kandang).
- \`id\` (UUID, PK), \`ownerId\`, \`date\` (Date), \`amount\` (BigInt — Rupiah)
- \`description\`, \`categoryId\` (opsional), \`notes\` (opsional), \`idempotencyKey\` (opsional)
- Audit lengkap
- Constraint: \`@@unique([createdById, idempotencyKey])\`
- Index: [ownerId, date], [ownerId, deletedAt, date], [categoryId], [deletedAt]

---

## Catatan Domain

- **Alur Order**: order dibuat (BELUM_DIHANTAR) → operator alokasi stok dari kandang (\`OrderSourceAllocation\`) → operator klik \`Hantar\` (status SEDANG_DIHANTAR, \`startedById\` terisi, \`pricePerKg\` dikunci, \`StockMovement\` ALLOCATION_OUT dibuat) → operator klik \`Selesai Pengantaran\` (status SUDAH_DIHANTAR, \`deliveredById\` terisi).
- **Pembatalan Order**: \`lifecycleStatus = CANCELLED\`, \`cancelledAt\`/\`cancelledById\`/\`cancelReason\` terisi, alokasi dirilis via StockMovement \`ALLOCATION_RELEASE\`.
- **Stok**: \`CoopStockBalance.availableKg\` = akumulasi semua \`StockMovement\` (IN − OUT) per kandang. \`StockMovement\` adalah ledger immutable; balance di-cache di \`CoopStockBalance\`.
- **Pembayaran**: \`Order.paymentStatus\` adalah status terkini, \`PaymentHistory\` adalah jurnal setiap update. \`amountPaid\` di history = nilai transaksi saat itu (bukan total bayar).
- **Harga**: \`EggPrice\` per tanggal. Saat \`Hantar\`, harga di tanggal kirim diambil sebagai \`Order.pricePerKg\` (priceSource STANDARD), kecuali user override (CUSTOM).
- **Populasi kandang**: \`Coop.population\` adalah snapshot terkini; \`CoopPopulationHistory\` adalah jurnal perubahan dengan \`effectiveDate\`.
`;
