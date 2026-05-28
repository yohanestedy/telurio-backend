export const SCHEMA_CONTEXT = `## Struktur Data Telurio

Berikut adalah ringkasan struktur data sistem. Gunakan informasi ini untuk memahami enum values dan field yang valid saat memanggil tools, dan untuk memberikan jawaban yang lebih akurat. Akses data tetap dibatasi sesuai role user.

### Role User
- ADMIN: akses penuh sistem
- OWNER: pemilik kandang, akses laporan finansial dan operasional
- OPERATOR: akses operasional kandang (input produksi, kelola order)

### Order (Pesanan Telur)
- quantityKg: jumlah kg pesanan
- pricePerKg: harga per kg, terkunci saat \`Hantar\` ditekan (bisa null sampai harga tanggal kirim tersedia)
- priceSource: STANDARD (dari harga harian) | CUSTOM (override manual)
- totalInvoice: quantityKg x pricePerKg, round-half-up ke Rupiah
- deliveryDate: tanggal kirim (boleh tanggal lampau untuk input historis)
- deliverBefore: jam target kirim (string)
- lifecycleStatus: ACTIVE | CANCELLED
- deliveryStatus: BELUM_DIHANTAR | SEDANG_DIHANTAR | SUDAH_DIHANTAR
- paymentStatus: BELUM_BAYAR | DP | LUNAS
- paymentMethod: CASH | TRANSFER
- dpAmount: jumlah DP (MVP hanya 1 DP per order)
- Relasi: Customer (1 order = 1 customer), OrderSourceAllocation (alokasi per kandang), PaymentHistory, StockMovement

### Customer (Pelanggan)
- name, address, phone
- Relasi: Order (1 customer bisa punya banyak order)

### Coop (Kandang)
- name (unik), population (jumlah ayam), chickenStrain, chickBirthDate
- depreciationPercent: default 15% (Decimal 5,2)
- isActive: boolean
- Relasi: ProductionRecord, OrderSourceAllocation, Expense, CoopStockBalance, StockMovement, CoopPopulationHistory, CoopHealthRecord

### CoopPopulationHistory (Riwayat Populasi Kandang)
- effectiveDate, previousPopulation, newPopulation, deltaPopulation
- changeType: INITIAL | ADJUSTMENT
- reason: catatan perubahan

### UserCoopAccess (Akses User ke Kandang)
- ownershipSharePercent: persentase kepemilikan (Decimal 5,2)
- Relasi: User, Coop (composite unique [userId, coopId])

### ProductionRecord (Catatan Produksi Telur)
- date, coopId, collectionTime
- goodKg (Decimal 12,3), goodCount (Int), brokenCount (Int, opsional)
- populationSnapshot: snapshot populasi saat input
- Composite unique: [date, coopId, collectionTime]

### CoopHealthRecord (Catatan Kesehatan Kandang)
- date, coopId, type, description
- type: VITAMIN | VACCINE | MEDICINE
- reminderDate, reminderEnabled, completedAt, completedById
- notes

### EggPrice (Harga Telur Harian)
- effectiveDate (unik), pricePerKg (BigInt Rupiah), notes

### CoopStockBalance (Saldo Stok Kandang)
- coopId (PK), availableKg (Decimal 12,3): stok tersedia per kandang real-time

### StockMovement (Pergerakan Stok)
- movementDate, coopId, quantityKg
- direction: IN | OUT
- movementType:
  - PRODUCTION_IN: input produksi
  - PRODUCTION_CORRECTION_IN: koreksi tambah produksi
  - PRODUCTION_CORRECTION_OUT: koreksi kurang produksi
  - ALLOCATION_OUT: alokasi keluar untuk order
  - ALLOCATION_RELEASE: rilis alokasi (saat order dibatalkan)
  - MANUAL_ADJUST_IN | MANUAL_ADJUST_OUT: penyesuaian manual
- sourceType: PRODUCTION_RECORD | ORDER_ALLOCATION | MANUAL_ADJUSTMENT
- sourceId: ID dari source (production record id, order id, dst)
- orderId: opsional, terkait order

### OrderSourceAllocation (Alokasi Stok ke Order)
- orderId, coopId, quantityKg: kandang mana yang menyumbang berapa kg ke order

### PaymentHistory (Riwayat Pembayaran)
- orderId, paymentStatus, paymentMethod
- amountPaid: jumlah transaksi saat update (bukan saldo kumulatif)
- notes

### ExpenseCategory & Expense (Pengeluaran Per Kandang)
- ExpenseCategory: dimiliki per user (ownerId), normalizedName untuk dedup
- Expense: terkait coopId, expenseCategoryId, amount (BigInt Rupiah), description, date

### GeneralExpenseCategory & GeneralExpense (Pengeluaran Umum, Tidak Per Kandang)
- Struktur mirip ExpenseCategory/Expense tapi tanpa coopId
- ownerId mengikat pengeluaran ke pemilik

### AuditLog (Log Audit)
- entityType, entityId, actionType: CREATE | UPDATE | STATUS_CHANGE | CORRECTION | ACTIVATE | DEACTIVATE
- actorUserId, coopId (opsional), summary, beforeDataJson, afterDataJson, metadataJson

### Catatan Penting
- Semua entitas pakai soft delete (deletedAt, deletedById, deleteReason)
- Field idempotencyKey ada di Order, Customer, Expense, GeneralExpense untuk mencegah duplikasi
- BigInt dipakai untuk Rupiah (pricePerKg, totalInvoice, dpAmount, amount)
- Decimal dipakai untuk kg (quantityKg, goodKg, availableKg)
`;
