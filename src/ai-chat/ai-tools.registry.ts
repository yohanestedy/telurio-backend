import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { OrdersService } from '../orders/orders.service';
import { CustomersService } from '../customers/customers.service';
import { CoopsService } from '../coops/coops.service';
import { StocksService } from '../stocks/stocks.service';
import { ProductionsService } from '../productions/productions.service';
import { ReportsService } from '../reports/reports.service';
import { CalendarService } from '../calendar/calendar.service';
import { ExpensesService } from '../expenses/expenses.service';
import { GeneralExpensesService } from '../general-expenses/general-expenses.service';
import { EggPricesService } from '../egg-prices/egg-prices.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CoopHealthService } from '../coop-health/coop-health.service';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { ExpenseCategoriesService } from '../expense-categories/expense-categories.service';
import { GeneralExpenseCategoriesService } from '../general-expense-categories/general-expense-categories.service';
import { type Permission, hasPermission } from '../common/policies';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryOrdersDto } from '../orders/dto';
import { QueryCustomersDto } from '../customers/dto';
import { QueryCoopsDto } from '../coops/dto';
import { QueryStockMovementsDto } from '../stocks/dto';
import { QueryProductionAnalyticsDto } from '../productions/dto';
import {
  QueryIncomeReportsDto,
  QueryMonthlySummaryDto,
} from '../reports/dto';
import {
  QueryExpensesDto,
  QueryExpenseSummaryDto,
} from '../expenses/dto';
import {
  QueryGeneralExpensesDto,
  QueryGeneralExpenseSummaryDto,
} from '../general-expenses/dto';
import { QueryAuditLogsDto } from '../audit-logs/dto';
import { QueryCoopHealthRecordsDto } from '../coop-health/dto';
import { QueryUsersDto } from '../users/dto';
import { QueryProductionsDto } from '../productions/dto';
import { QueryCalendarDto } from '../calendar/dto';
import dayjs from 'dayjs';

export interface AiAuthUser {
  id: string;
  role: Role;
  username?: string;
}

export interface AiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  permission: Permission;
  execute: (args: Record<string, unknown>, user: AiAuthUser) => Promise<unknown>;
}

interface OpenAiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

@Injectable()
export class AiToolsRegistry {
  private readonly tools: AiTool[];

  constructor(
    private readonly auth: AuthService,
    private readonly orders: OrdersService,
    private readonly customers: CustomersService,
    private readonly coops: CoopsService,
    private readonly stocks: StocksService,
    private readonly productions: ProductionsService,
    private readonly reports: ReportsService,
    private readonly calendar: CalendarService,
    private readonly expenses: ExpensesService,
    private readonly generalExpenses: GeneralExpensesService,
    private readonly eggPrices: EggPricesService,
    private readonly auditLogs: AuditLogsService,
    private readonly coopHealth: CoopHealthService,
    private readonly users: UsersService,
    private readonly payments: PaymentsService,
    private readonly deliveries: DeliveriesService,
    private readonly expenseCategories: ExpenseCategoriesService,
    private readonly generalExpenseCategories: GeneralExpenseCategoriesService,
  ) {
    this.tools = this.build();
  }

  getAllowedTools(user: AiAuthUser): AiTool[] {
    return this.tools.filter((tool) => hasPermission(user.role, tool.permission));
  }

  getOpenAiToolDefinitions(user: AiAuthUser): OpenAiToolDefinition[] {
    return this.getAllowedTools(user).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async runTool(name: string, args: Record<string, unknown>, user: AiAuthUser) {
    const tool = this.tools.find((item) => item.name === name);
    if (!tool) {
      return { error: `Tool '${name}' tidak ditemukan` };
    }
    if (!hasPermission(user.role, tool.permission)) {
      return { error: `Anda tidak memiliki izin untuk menggunakan tool '${name}'` };
    }
    try {
      return await tool.execute(args, user);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { error: message };
    }
  }

  private async toQuery<T extends object>(cls: new () => T, args: Record<string, unknown>): Promise<T> {
    const instance = plainToInstance(cls, args, { enableImplicitConversion: true });
    await validate(instance, { whitelist: true, forbidNonWhitelisted: false });
    return instance;
  }

  private todayKey() {
    return dayjs().format('YYYY-MM-DD');
  }

  private build(): AiTool[] {
    return [
      {
        name: 'get_my_profile',
        description:
          'Ambil profil user yang sedang chat (nama, username, role, akses kandang). Wajib dipanggil ketika user bertanya soal data dirinya sendiri seperti "siapa saya", "nama saya", atau "akses saya apa".',
        permission: 'profile.view',
        parameters: { type: 'object', properties: {} },
        execute: async (_args, user) => this.auth.getMe(user.id),
      },
      {
        name: 'get_today_orders',
        description:
          'Ambil daftar pesanan dengan tanggal kirim hari ini. Berguna ketika user bertanya soal pesanan hari ini.',
        permission: 'orders.view',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'integer', description: 'Jumlah maksimal pesanan yang dikembalikan, default 50.' },
          },
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryOrdersDto, {
            deliveryDate: this.todayKey(),
            limit: args.limit ?? 50,
            sortBy: 'deliveryDate',
            order: 'asc',
          });
          return this.orders.listOrders(user, query);
        },
      },
      {
        name: 'get_orders_by_date_range',
        description:
          'Ambil daftar pesanan dalam rentang tanggal kirim tertentu. Bisa difilter status pengantaran/pembayaran.',
        permission: 'orders.view',
        parameters: {
          type: 'object',
          properties: {
            startDate: { type: 'string', description: 'Tanggal awal format YYYY-MM-DD' },
            endDate: { type: 'string', description: 'Tanggal akhir format YYYY-MM-DD' },
            deliveryStatus: {
              type: 'string',
              enum: ['BELUM_DIHANTAR', 'SEDANG_DIHANTAR', 'SUDAH_DIHANTAR'],
            },
            paymentStatus: { type: 'string', enum: ['BELUM_BAYAR', 'DP', 'LUNAS'] },
            limit: { type: 'integer' },
          },
          required: ['startDate', 'endDate'],
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryOrdersDto, {
            startDate: args.startDate,
            endDate: args.endDate,
            deliveryStatus: args.deliveryStatus,
            paymentStatus: args.paymentStatus,
            limit: args.limit ?? 100,
            sortBy: 'deliveryDate',
            order: 'asc',
          });
          return this.orders.listOrders(user, query);
        },
      },
      {
        name: 'get_order_detail',
        description: 'Ambil detail satu pesanan berdasarkan ID-nya.',
        permission: 'orders.view',
        parameters: {
          type: 'object',
          properties: {
            orderId: { type: 'string' },
          },
          required: ['orderId'],
        },
        execute: async (args, user) => this.orders.getOrderDetail(String(args.orderId), user),
      },
      {
        name: 'get_today_price',
        description: 'Ambil harga telur hari ini yang sedang aktif.',
        permission: 'prices.view',
        parameters: { type: 'object', properties: {} },
        execute: async () => this.eggPrices.getCurrentPrice({}),
      },
      {
        name: 'get_live_stock',
        description:
          'Ambil ringkasan stok telur live per kandang plus pergerakan masuk/keluar hari ini.',
        permission: 'stocks.view',
        parameters: { type: 'object', properties: {} },
        execute: async (_args, user) => this.stocks.getLiveStock(user),
      },
      {
        name: 'get_stock_movements',
        description:
          'Ambil daftar pergerakan stok (masuk/keluar) dalam rentang tanggal tertentu, opsional difilter per kandang.',
        permission: 'stocks.view',
        parameters: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            coopId: { type: 'string' },
            direction: { type: 'string', enum: ['IN', 'OUT'] },
            limit: { type: 'integer' },
          },
          required: ['startDate', 'endDate'],
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryStockMovementsDto, {
            startDate: args.startDate,
            endDate: args.endDate,
            coopId: args.coopId,
            direction: args.direction,
            limit: args.limit ?? 100,
          });
          return this.stocks.listMovements(user, query);
        },
      },
      {
        name: 'get_production_analytics',
        description:
          'Ambil analitik produksi telur untuk periode 1w/1m/3m/6m. Berisi rata-rata harian dan total. Bisa difilter per kandang.',
        permission: 'productions.view',
        parameters: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['1w', '1m', '3m', '6m'] },
            coopId: { type: 'string' },
            endDate: { type: 'string' },
          },
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryProductionAnalyticsDto, {
            period: args.period ?? '1w',
            coopId: args.coopId,
            endDate: args.endDate,
          });
          return this.productions.getProductionAnalytics(user, query);
        },
      },
      {
        name: 'list_coops',
        description: 'Daftar semua kandang. Bisa difilter hanya yang aktif.',
        permission: 'coops.view',
        parameters: {
          type: 'object',
          properties: {
            isActive: { type: 'boolean' },
          },
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryCoopsDto, {
            isActive: args.isActive,
            all: true,
            sortBy: 'name',
            order: 'asc',
          });
          return this.coops.listCoops(user, query);
        },
      },
      {
        name: 'list_customers',
        description: 'Daftar pelanggan, bisa dicari berdasarkan nama atau telepon.',
        permission: 'customers.view',
        parameters: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            limit: { type: 'integer' },
          },
        },
        execute: async (args) => {
          const query = await this.toQuery(QueryCustomersDto, {
            search: args.search,
            limit: args.limit ?? 50,
            sortBy: 'name',
            order: 'asc',
          });
          return this.customers.listCustomers(query);
        },
      },
      {
        name: 'get_gross_income',
        description: 'Laporan gross income per bulan/tahun. Bisa difilter per kandang.',
        permission: 'reports.view',
        parameters: {
          type: 'object',
          properties: {
            year: { type: 'integer' },
            month: { type: 'integer' },
            coopId: { type: 'string' },
            ownerId: { type: 'string' },
          },
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryIncomeReportsDto, args);
          return this.reports.getGrossIncome(user, query);
        },
      },
      {
        name: 'get_monthly_summary',
        description: 'Ringkasan finansial bulanan: pendapatan, pengeluaran, dan laba.',
        permission: 'reports.view',
        parameters: {
          type: 'object',
          properties: {
            year: { type: 'integer' },
            month: { type: 'integer' },
            ownerId: { type: 'string' },
          },
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryMonthlySummaryDto, args);
          return this.reports.getMonthlySummary(user, query);
        },
      },
      {
        name: 'get_calendar_day',
        description:
          'Ambil semua event di kalender (pesanan, produksi, pengeluaran, dll) untuk satu tanggal spesifik.',
        permission: 'calendar.view',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Tanggal format YYYY-MM-DD' },
          },
          required: ['date'],
        },
        execute: async (args, user) => this.calendar.getDayEvents(user, String(args.date)),
      },
      {
        name: 'list_expenses',
        description:
          'Daftar pengeluaran kandang dalam rentang tanggal. Bisa difilter per kandang dan kategori.',
        permission: 'expenses.view',
        parameters: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            coopId: { type: 'string' },
            categoryId: { type: 'string' },
            limit: { type: 'integer' },
          },
          required: ['startDate', 'endDate'],
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryExpensesDto, {
            startDate: args.startDate,
            endDate: args.endDate,
            coopId: args.coopId,
            categoryId: args.categoryId,
            limit: args.limit ?? 100,
          });
          return this.expenses.listExpenses(user, query);
        },
      },
      {
        name: 'list_general_expenses',
        description: 'Daftar pengeluaran pribadi dalam rentang tanggal.',
        permission: 'general-expenses.view',
        parameters: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            ownerId: { type: 'string' },
            limit: { type: 'integer' },
          },
          required: ['startDate', 'endDate'],
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryGeneralExpensesDto, {
            startDate: args.startDate,
            endDate: args.endDate,
            ownerId: args.ownerId,
            limit: args.limit ?? 100,
          });
          return this.generalExpenses.listGeneralExpenses(user, query);
        },
      },
      {
        name: 'get_expenses_summary',
        description:
          'Ringkasan pengeluaran kandang per kategori untuk periode tertentu (bulan/tahun atau range tanggal).',
        permission: 'expenses.view',
        parameters: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            month: { type: 'integer' },
            year: { type: 'integer' },
            coopId: { type: 'string' },
          },
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryExpenseSummaryDto, args);
          return this.expenses.getSummary(user, query);
        },
      },
      {
        name: 'get_general_expenses_summary',
        description: 'Ringkasan pengeluaran pribadi per kategori atau owner.',
        permission: 'general-expenses.view',
        parameters: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            month: { type: 'integer' },
            year: { type: 'integer' },
            ownerId: { type: 'string' },
          },
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryGeneralExpenseSummaryDto, args);
          return this.generalExpenses.getSummary(user, query);
        },
      },
      {
        name: 'get_net_income',
        description:
          'Laporan net income (pendapatan dikurangi pengeluaran) per bulan/tahun, opsional per kandang.',
        permission: 'reports.view',
        parameters: {
          type: 'object',
          properties: {
            year: { type: 'integer' },
            month: { type: 'integer' },
            coopId: { type: 'string' },
            ownerId: { type: 'string' },
          },
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryIncomeReportsDto, args);
          return this.reports.getNetIncome(user, query);
        },
      },
      {
        name: 'list_calendar_range',
        description:
          'Daftar event kalender (orders, productions, expenses, dll) dalam rentang tanggal.',
        permission: 'calendar.view',
        parameters: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
          },
          required: ['startDate', 'endDate'],
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryCalendarDto, {
            startDate: args.startDate,
            endDate: args.endDate,
          });
          return this.calendar.listEvents(user, query);
        },
      },
      {
        name: 'list_calendar_markers',
        description:
          'Marker kalender (banyak event per tanggal) untuk overview cepat.',
        permission: 'calendar.view',
        parameters: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
          },
          required: ['startDate', 'endDate'],
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryCalendarDto, {
            startDate: args.startDate,
            endDate: args.endDate,
          });
          return this.calendar.listMarkers(user, query);
        },
      },
      {
        name: 'list_productions',
        description:
          'Daftar entri produksi telur harian. Bisa difilter per kandang dan rentang tanggal.',
        permission: 'productions.view',
        parameters: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            coopId: { type: 'string' },
            limit: { type: 'integer' },
          },
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryProductionsDto, {
            startDate: args.startDate,
            endDate: args.endDate,
            coopId: args.coopId,
            limit: args.limit ?? 100,
            sortBy: 'date',
            order: 'desc',
          });
          return this.productions.listProductions(user, query);
        },
      },
      {
        name: 'list_coop_health_records',
        description:
          'Daftar catatan kesehatan kandang (vaksinasi, penyakit, kematian, dll).',
        permission: 'coop-health.view',
        parameters: {
          type: 'object',
          properties: {
            coopId: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            type: {
              type: 'string',
              description: 'Tipe record kesehatan (mis. VACCINATION, DEATH, ILLNESS).',
            },
            limit: { type: 'integer' },
          },
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryCoopHealthRecordsDto, {
            coopId: args.coopId,
            startDate: args.startDate,
            endDate: args.endDate,
            type: args.type,
            limit: args.limit ?? 100,
          });
          return this.coopHealth.listRecords(user, query);
        },
      },
      {
        name: 'get_coop_health_record',
        description: 'Detail satu catatan kesehatan kandang berdasarkan ID.',
        permission: 'coop-health.view',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        execute: async (args, user) =>
          this.coopHealth.getRecord(String(args.id), user),
      },
      {
        name: 'list_users',
        description:
          'Daftar user (akun) sistem dengan role dan status aktif. Khusus untuk admin.',
        permission: 'users.view',
        parameters: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['ADMIN', 'OWNER', 'OPERATOR'] },
            isActive: { type: 'boolean' },
            limit: { type: 'integer' },
          },
        },
        execute: async (args) => {
          const query = await this.toQuery(QueryUsersDto, {
            role: args.role,
            isActive: args.isActive,
            limit: args.limit ?? 100,
          });
          return this.users.listUsers(query);
        },
      },
      {
        name: 'list_audit_logs',
        description:
          'Daftar audit log (riwayat perubahan data). Bisa difilter per entity, user, atau tanggal.',
        permission: 'dashboard.view',
        parameters: {
          type: 'object',
          properties: {
            entityType: { type: 'string' },
            entityId: { type: 'string' },
            actorUserId: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            limit: { type: 'integer' },
          },
        },
        execute: async (args, user) => {
          const query = await this.toQuery(QueryAuditLogsDto, {
            entityType: args.entityType,
            entityId: args.entityId,
            actorUserId: args.actorUserId,
            startDate: args.startDate,
            endDate: args.endDate,
            limit: args.limit ?? 50,
            sortBy: 'createdAt',
            order: 'desc',
          });
          return this.auditLogs.listLogs(user, query);
        },
      },
      {
        name: 'get_payment_history',
        description:
          'Riwayat pembayaran untuk satu pesanan tertentu (DP, lunas, dll).',
        permission: 'orders.pay',
        parameters: {
          type: 'object',
          properties: {
            orderId: { type: 'string' },
          },
          required: ['orderId'],
        },
        execute: async (args, user) =>
          this.payments.getPaymentHistory(String(args.orderId), user),
      },
      {
        name: 'get_order_allocations',
        description:
          'Detail alokasi pengiriman pesanan (kandang mana yang menyumbang berapa kg).',
        permission: 'orders.view',
        parameters: {
          type: 'object',
          properties: {
            orderId: { type: 'string' },
          },
          required: ['orderId'],
        },
        execute: async (args, user) =>
          this.deliveries.getAllocations(String(args.orderId), user),
      },
      {
        name: 'list_expense_categories',
        description: 'Daftar kategori pengeluaran kandang.',
        permission: 'expense-categories.view',
        parameters: { type: 'object', properties: {} },
        execute: async (_args, user) =>
          this.expenseCategories.listCategories(user),
      },
      {
        name: 'list_general_expense_categories',
        description: 'Daftar kategori pengeluaran pribadi.',
        permission: 'general-expense-categories.view',
        parameters: { type: 'object', properties: {} },
        execute: async (_args, user) =>
          this.generalExpenseCategories.listCategories(user),
      },
      {
        name: 'list_egg_prices',
        description:
          'Riwayat harga telur. Bisa difilter per rentang tanggal.',
        permission: 'prices.view',
        parameters: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            limit: { type: 'integer' },
          },
        },
        execute: async (args) => {
          return this.eggPrices.listPrices({
            startDate: args.startDate as string | undefined,
            endDate: args.endDate as string | undefined,
            limit: (args.limit as number | undefined) ?? 100,
          } as Parameters<typeof this.eggPrices.listPrices>[0]);
        },
      },
    ];
  }
}
