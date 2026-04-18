import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { getTodayDateOnlyUtc, NotFoundException } from '../common';

type Canvas2DContext = {
  fillStyle: string;
  font: string;
  textAlign: 'left' | 'right' | 'center' | 'start' | 'end';
  fillRect: (x: number, y: number, width: number, height: number) => void;
  fillText: (text: string, x: number, y: number) => void;
};

type CanvasInstance = {
  getContext: (type: '2d') => Canvas2DContext;
  toBuffer: (mimeType?: string) => Buffer;
};

type CanvasFactory = {
  createCanvas: (width: number, height: number) => CanvasInstance;
};

export interface PublicShareImageResult {
  buffer: Buffer;
  contentType: 'image/png' | 'image/svg+xml';
  filename: string;
}

type PublicPriceTrend = 'NAIK' | 'TURUN' | 'TETAP' | 'BELUM_ADA_DATA';

@Injectable()
export class PublicPricesService {
  constructor(private prisma: PrismaService) {}

  async getCurrentPublicPrice() {
    const current = await this.findCurrentPrice();
    const previous = await this.findPreviousPrice(current.effectiveDate);

    let trend: PublicPriceTrend = 'BELUM_ADA_DATA';
    let differencePerKg: string | null = null;

    if (previous) {
      if (current.pricePerKg > previous.pricePerKg) {
        trend = 'NAIK';
        differencePerKg = (current.pricePerKg - previous.pricePerKg).toString();
      } else if (current.pricePerKg < previous.pricePerKg) {
        trend = 'TURUN';
        differencePerKg = (previous.pricePerKg - current.pricePerKg).toString();
      } else {
        trend = 'TETAP';
        differencePerKg = '0';
      }
    }

    return {
      effectiveDate: current.effectiveDate,
      pricePerKg: current.pricePerKg,
      comparison: {
        trend,
        differencePerKg,
        previousDate: previous?.effectiveDate ?? null,
        previousPricePerKg: previous?.pricePerKg ?? null,
      },
    };
  }

  async getShareText() {
    const current = await this.findCurrentPrice();

    const formattedDate = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(current.effectiveDate);

    const formattedPrice = new Intl.NumberFormat('id-ID').format(
      Number(current.pricePerKg),
    );

    return {
      text: `Harga telur hari ini (${formattedDate}): Rp ${formattedPrice}/kg\n— Telurio`,
    };
  }

  async generateShareImage(): Promise<PublicShareImageResult> {
    const current = await this.findCurrentPrice();

    try {
      const canvasFactory =
        (await import('@napi-rs/canvas')) as unknown as CanvasFactory;

      const width = 1080;
      const height = 1080;
      const canvas = canvasFactory.createCanvas(width, height);
      const context = canvas.getContext('2d');

      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, width, height);

      context.fillStyle = '#F3F4F6';
      context.fillRect(80, 80, width - 160, height - 160);

      context.fillStyle = '#111827';
      context.font = 'bold 64px Sans';
      context.textAlign = 'center';
      context.fillText('Harga Telur Hari Ini', width / 2, 280);

      const formattedPrice = new Intl.NumberFormat('id-ID').format(
        Number(current.pricePerKg),
      );

      context.fillStyle = '#047857';
      context.font = 'bold 96px Sans';
      context.fillText(`Rp ${formattedPrice}/kg`, width / 2, 520);

      const formattedDate = new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(current.effectiveDate);

      context.fillStyle = '#374151';
      context.font = '42px Sans';
      context.fillText(formattedDate, width / 2, 650);

      context.fillStyle = '#6B7280';
      context.font = 'bold 40px Sans';
      context.fillText('Telurio Egg Farm Management', width / 2, 820);

      return {
        buffer: canvas.toBuffer('image/png'),
        contentType: 'image/png',
        filename: 'egg-price.png',
      };
    } catch {
      const formattedPrice = new Intl.NumberFormat('id-ID').format(
        Number(current.pricePerKg),
      );

      const formattedDate = new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(current.effectiveDate);

      const safeDate = this.escapeXml(formattedDate);
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" fill="#ffffff"/>
  <rect x="80" y="80" width="920" height="920" rx="16" fill="#f3f4f6"/>
  <text x="540" y="280" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#111827">Harga Telur Hari Ini</text>
  <text x="540" y="520" text-anchor="middle" font-family="Arial, sans-serif" font-size="96" font-weight="700" fill="#047857">Rp ${formattedPrice}/kg</text>
  <text x="540" y="650" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" fill="#374151">${safeDate}</text>
  <text x="540" y="820" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="700" fill="#6b7280">Telurio Egg Farm Management</text>
</svg>`;

      return {
        buffer: Buffer.from(svg, 'utf-8'),
        contentType: 'image/svg+xml',
        filename: 'egg-price.svg',
      };
    }
  }

  private escapeXml(input: string): string {
    return input
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  private async findCurrentPrice() {
    const today = getTodayDateOnlyUtc();
    const current = await this.prisma.eggPrice.findFirst({
      where: {
        deletedAt: null,
        effectiveDate: today,
      },
      select: {
        effectiveDate: true,
        pricePerKg: true,
      },
    });

    if (!current) {
      throw new NotFoundException('No egg price found for today');
    }

    return current;
  }

  private async findPreviousPrice(currentDate: Date) {
    return this.prisma.eggPrice.findFirst({
      where: {
        deletedAt: null,
        effectiveDate: {
          lt: currentDate,
        },
      },
      select: {
        effectiveDate: true,
        pricePerKg: true,
      },
      orderBy: {
        effectiveDate: 'desc',
      },
    });
  }
}
