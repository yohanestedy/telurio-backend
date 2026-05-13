import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DeliveryStatus, OrderLifecycleStatus } from '@prisma/client';
import { getTodayDateOnlyUtc, toDateKey } from '../common';
import { PrismaService } from '../prisma';
import { FonnteClient } from './fonnte.client';
import { WHATSAPP_GATEWAY_CLIENT } from './notifications.constants';
import type { WhatsAppGatewayClient } from './whatsapp-gateway.client';

interface OrderCreatedNotificationPayload {
  id: string;
  customer: {
    name: string;
    phone: string | null;
  };
  quantityKg: string;
  pricePerKg: bigint | string | number | null;
  totalInvoice: bigint | string | number | null;
  deliveryDate: Date | string;
  deliverBefore: string | null;
  paymentStatus: string;
  paymentMethod: string | null;
  dpAmount: bigint | string | number | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: Date | string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sentReminderKeys = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly fonnteClient: FonnteClient,
    @Inject(WHATSAPP_GATEWAY_CLIENT)
    private readonly waGatewayClient: WhatsAppGatewayClient,
  ) {}

  @Cron('0 17,19 * * *', { timeZone: 'Asia/Jakarta' })
  async runScheduledOrderReminder() {
    if (!this.isOrderReminderSchedulerEnabled()) {
      return;
    }

    if (!this.isWhatsAppEnabled()) {
      return;
    }

    const now = this.getJakartaDateTimeParts();
    const reminderKey = `${now.dateKey}-${now.time}`;
    if (this.sentReminderKeys.has(reminderKey)) {
      return;
    }
    this.sentReminderKeys.add(reminderKey);

    const target = this.getWhatsAppTarget();
    if (!target) {
      this.logger.warn('WA_TARGET is not configured; order reminder skipped');
      return;
    }

    const message = await this.buildTodayDeliveryReminderMessage(now.dateKey);
    if (!message) {
      return;
    }

    await this.sendMessage(target, message, 'today-delivery-reminder');
  }

  private isWhatsAppEnabled() {
    return this.configService.get<string>('WHATSAPP_ENABLED') !== 'false';
  }

  private isOrderReminderSchedulerEnabled() {
    return (
      this.configService.get<string>('ORDER_REMINDER_SCHEDULER_ENABLED') ===
      'true'
    );
  }

  async notifyOrderCreated(order: OrderCreatedNotificationPayload) {
    if (!this.isWhatsAppEnabled()) {
      return;
    }

    const target = this.getWhatsAppTarget();
    if (!target) {
      this.logger.warn(
        'WA_TARGET is not configured; order notification skipped',
      );
      return;
    }

    await this.sendMessage(
      target,
      this.buildOrderCreatedMessage(order),
      'order-created',
    );

    if (this.isTodayDeliveryDate(order.deliveryDate)) {
      await this.wait(2000);
      const todayOrdersMessage = await this.buildTodayOrdersMessage();
      await this.sendMessage(
        target,
        todayOrdersMessage,
        'today-orders-summary',
      );
    }
  }

  private buildOrderCreatedMessage(order: OrderCreatedNotificationPayload) {
    const priceLabel = order.pricePerKg
      ? this.formatRupiah(order.pricePerKg)
      : 'Belum dikunci';
    const invoiceLabel = order.totalInvoice
      ? this.formatRupiah(order.totalInvoice)
      : 'Belum dihitung';
    const notes = order.notes?.trim() ? order.notes.trim() : '-';
    const paymentLines = [
      `Pembayaran: ${this.paymentStatusLabel(order.paymentStatus)}`,
    ];

    if (order.paymentStatus !== 'BELUM_BAYAR') {
      paymentLines.push(
        `Metode bayar: ${this.paymentMethodLabel(order.paymentMethod)}`,
        `DP: ${order.dpAmount ? this.formatRupiah(order.dpAmount) : '-'}`,
      );
    }

    return [
      '*Pesanan Baru*',
      '',
      `Pelanggan: ${order.customer.name}`,
      `Jumlah: ${this.formatKg(order.quantityKg)} kg`,
      `Tanggal kirim: ${this.formatDateId(order.deliveryDate)}`,
      `Batas antar: ${order.deliverBefore ?? '-'}`,
      '',
      `Harga/kg: ${priceLabel}`,
      `Total: ${invoiceLabel}`,
      ...paymentLines,
      '',
      `Catatan: ${notes}`,
      `Dibuat oleh: ${order.createdByName ?? '-'}`,
      `Waktu input: ${this.formatDateTimeId(order.createdAt)}`,
    ].join('\n');
  }

  private async buildTodayOrdersMessage() {
    const today = getTodayDateOnlyUtc();
    const orders = await this.prisma.order.findMany({
      where: {
        deliveryDate: today,
        lifecycleStatus: OrderLifecycleStatus.ACTIVE,
      },
      include: {
        customer: { select: { name: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const lines = orders.map((order, index) =>
      [
        `${index + 1}. ${order.customer.name}`,
        `*${this.formatKg(order.quantityKg.toString())}* kg @${order.pricePerKg ? this.formatNumber(order.pricePerKg) : 'Belum dikunci'}`,
        order.totalInvoice
          ? this.formatNumber(order.totalInvoice)
          : 'Belum dihitung',
        this.paymentStatusLabel(order.paymentStatus),
        this.deliveryStatusLabel(order.deliveryStatus),
      ].join(' / '),
    );

    return [
      '*Daftar Pesanan Hari Ini*',
      this.formatLongDateId(today),
      '',
      ...(lines.length ? lines : ['Belum ada pesanan untuk hari ini.']),
    ].join('\n');
  }

  private async buildTodayDeliveryReminderMessage(dateKey: string) {
    const today = new Date(`${dateKey}T00:00:00.000Z`);
    const orders = await this.prisma.order.findMany({
      where: {
        deliveryDate: today,
        lifecycleStatus: OrderLifecycleStatus.ACTIVE,
        deliveryStatus: {
          in: [DeliveryStatus.BELUM_DIHANTAR, DeliveryStatus.SEDANG_DIHANTAR],
        },
      },
      include: {
        customer: { select: { name: true } },
      },
      orderBy: [{ deliveryStatus: 'asc' }, { createdAt: 'asc' }],
    });

    if (orders.length === 0) {
      return null;
    }

    const pendingOrders = orders.filter(
      (order) => order.deliveryStatus === DeliveryStatus.BELUM_DIHANTAR,
    );
    const inDeliveryOrders = orders.filter(
      (order) => order.deliveryStatus === DeliveryStatus.SEDANG_DIHANTAR,
    );
    const lines = [
      '🚨 *Tugas Belum Selesai*',
      this.formatLongDateId(today),
      '',
    ];

    if (pendingOrders.length > 0) {
      lines.push(
        '🟠 *Belum Dihantar*',
        ...pendingOrders.map((order, index) =>
          this.formatReminderOrderLine(order, index),
        ),
        '',
      );
    }

    if (inDeliveryOrders.length > 0) {
      lines.push(
        '🔵 *Sedang Dihantar*',
        ...inDeliveryOrders.map((order, index) =>
          this.formatReminderOrderLine(order, index),
        ),
        '_Jika sudah sampai, mohon selesaikan pengantaran._',
      );
    }

    return lines.join('\n').trim();
  }

  private formatReminderOrderLine(
    order: {
      customer: { name: string };
      quantityKg: { toString(): string };
      paymentStatus: string;
    },
    index: number,
  ) {
    return `${index + 1}. ${order.customer.name} | *${this.formatKg(order.quantityKg.toString())}* kg | ${this.paymentStatusLabel(order.paymentStatus)}`;
  }

  private async sendMessage(target: string, message: string, context: string) {
    try {
      await this.waGatewayClient.sendMessage({ target, message });
    } catch (error) {
      if (this.shouldFallbackToFonnte()) {
        this.logger.warn(
          `Primary WhatsApp provider failed for ${context}. Retrying with Fonnte: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        try {
          await this.fonnteClient.sendMessage({ target, message });
          this.logger.log(
            `Fallback to Fonnte succeeded for ${context} WhatsApp notification`,
          );
          return;
        } catch (fallbackError) {
          this.logger.warn(
            `Fallback Fonnte failed to send ${context} WhatsApp notification: ${
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError)
            }`,
          );
          return;
        }
      }

      this.logger.warn(
        `Failed to send ${context} WhatsApp notification: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private shouldFallbackToFonnte() {
    return (
      (this.configService.get<string>('WHATSAPP_PROVIDER') ?? 'fonnte')
        .toLowerCase()
        .trim() === 'gowa'
    );
  }

  private getWhatsAppTarget() {
    return this.configService.get<string>('WA_TARGET');
  }

  private isTodayDeliveryDate(value: Date | string) {
    return toDateKey(new Date(value)) === toDateKey(getTodayDateOnlyUtc());
  }

  private wait(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private getJakartaDateTimeParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';

    return {
      dateKey: `${value('year')}-${value('month')}-${value('day')}`,
      time: `${value('hour')}:${value('minute')}`,
    };
  }

  private formatKg(value: string | number) {
    const normalized = Number(String(value).replace(/,/g, ''));
    if (Number.isNaN(normalized)) {
      return String(value);
    }

    return normalized.toLocaleString('id-ID', {
      maximumFractionDigits: 3,
    });
  }

  private formatRupiah(value: bigint | string | number) {
    return `Rp ${this.formatNumber(value)}`;
  }

  private formatNumber(value: bigint | string | number) {
    const normalized =
      typeof value === 'bigint'
        ? value.toString()
        : String(value).replace(/,/g, '');

    return Number(normalized).toLocaleString('id-ID');
  }

  private formatDateId(value: Date | string) {
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }

  private formatDateTimeId(value: Date | string) {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value));
  }

  private formatLongDateId(value: Date | string) {
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(value));
  }

  private paymentStatusLabel(value: string) {
    return (
      {
        BELUM_BAYAR: 'Belum Bayar',
        DP: 'DP',
        LUNAS: 'Lunas',
      }[value] ?? value
    );
  }

  private paymentMethodLabel(value: string | null) {
    if (!value) {
      return '-';
    }

    return (
      {
        CASH: 'Cash',
        TRANSFER: 'Transfer',
      }[value] ?? value
    );
  }

  private deliveryStatusLabel(value: string) {
    return (
      {
        BELUM_DIHANTAR: 'Belum Dihantar',
        SEDANG_DIHANTAR: 'Sedang Dihantar',
        SUDAH_DIHANTAR: 'Sudah Dihantar',
      }[value] ?? value
    );
  }
}
