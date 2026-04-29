import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderLifecycleStatus } from '@prisma/client';
import { getTodayDateOnlyUtc, toDateKey } from '../common';
import { PrismaService } from '../prisma';
import { FonnteClient } from './fonnte.client';

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

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly fonnteClient: FonnteClient,
  ) {}

  async notifyOrderCreated(order: OrderCreatedNotificationPayload) {
    if (!this.isWhatsAppEnabled()) {
      return;
    }

    const target = this.configService.get<string>('FONNTE_GROUP_FAMILY_ID');
    if (!target) {
      this.logger.warn(
        'FONNTE_GROUP_FAMILY_ID is not configured; order notification skipped',
      );
      return;
    }

    await this.sendMessage(
      target,
      this.buildOrderCreatedMessage(order),
      'order-created',
    );

    if (this.isTodayDeliveryDate(order.deliveryDate)) {
      const todayOrdersMessage = await this.buildTodayOrdersMessage();
      await this.sendMessage(
        target,
        todayOrdersMessage,
        'today-orders-summary',
      );
    }
  }

  private isWhatsAppEnabled() {
    return this.configService.get<string>('FONNTE_ENABLED') !== 'false';
  }

  private buildOrderCreatedMessage(order: OrderCreatedNotificationPayload) {
    const priceLabel = order.pricePerKg
      ? this.formatRupiah(order.pricePerKg)
      : 'Belum dikunci';
    const invoiceLabel = order.totalInvoice
      ? this.formatRupiah(order.totalInvoice)
      : 'Belum dihitung';
    const customerPhone = order.customer.phone ?? '-';
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
        `${this.formatKg(order.quantityKg.toString())} kg @ ${order.pricePerKg ? this.formatNumber(order.pricePerKg) : 'Belum dikunci'}`,
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

  private async sendMessage(target: string, message: string, context: string) {
    try {
      await this.fonnteClient.sendMessage({ target, message });
    } catch (error) {
      this.logger.warn(
        `Failed to send ${context} WhatsApp notification: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private isTodayDeliveryDate(value: Date | string) {
    return toDateKey(new Date(value)) === toDateKey(getTodayDateOnlyUtc());
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
