import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { getTodayDateOnlyUtc, NotFoundException } from '../common';

type Canvas2DContext = {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: 'left' | 'right' | 'center' | 'start' | 'end';
  globalAlpha: number;
  fillRect: (x: number, y: number, width: number, height: number) => void;
  fillText: (text: string, x: number, y: number) => void;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  arc: (
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ) => void;
  closePath: () => void;
  fill: () => void;
  stroke: () => void;
  getImageData: (
    x: number,
    y: number,
    width: number,
    height: number,
  ) => { data: Uint8ClampedArray };
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

type PublicPriceComparison = {
  trend: PublicPriceTrend;
  differencePerKg: string | null;
  previousDate: Date | null;
  previousPricePerKg: bigint | null;
};

type PublicPriceSnapshot = {
  effectiveDate: Date;
  pricePerKg: bigint;
  comparison: PublicPriceComparison;
};

@Injectable()
export class PublicPricesService {
  constructor(private prisma: PrismaService) {}

  async getCurrentPublicPrice() {
    const snapshot = await this.getCurrentSnapshot();

    return {
      effectiveDate: snapshot.effectiveDate,
      pricePerKg: snapshot.pricePerKg.toString(),
      comparison: {
        trend: snapshot.comparison.trend,
        differencePerKg: snapshot.comparison.differencePerKg,
        previousDate: snapshot.comparison.previousDate,
        previousPricePerKg:
          snapshot.comparison.previousPricePerKg?.toString() ?? null,
      },
    };
  }

  async getShareText() {
    const snapshot = await this.getCurrentSnapshot();
    const formattedPrice = new Intl.NumberFormat('id-ID').format(
      Number(snapshot.pricePerKg),
    );
    const formattedDate = this.capitalizeFirst(
      new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(snapshot.effectiveDate),
    );

    return {
      text: [
        'Harga Telur Hari Ini - Telurio',
        `Tanggal: ${formattedDate}`,
        `Harga: Rp ${formattedPrice}/kg`,
        `Pergerakan: ${this.buildTrendLabel(snapshot.comparison)}`,
        'Referensi harga standar Provinsi Lampung.',
      ].join('\n'),
    };
  }

  async generateShareImage(): Promise<PublicShareImageResult> {
    const snapshot = await this.getCurrentSnapshot();
    const trendBadge = this.buildTrendBadge(snapshot.comparison);
    const formattedPrice = new Intl.NumberFormat('id-ID').format(
      Number(snapshot.pricePerKg),
    );
    const formattedDate = this.capitalizeFirst(
      new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(snapshot.effectiveDate),
    );

    const fontStack = this.getFontStack();

    try {
      const canvasFactory =
        (await import('@napi-rs/canvas')) as unknown as CanvasFactory;

      const width = 1080;
      const height = 1080;
      const canvas = canvasFactory.createCanvas(width, height);
      const context = canvas.getContext('2d');

      // Some serverless runtimes render shapes but fail to render glyphs.
      if (!this.canRenderCanvasText(canvasFactory, fontStack)) {
        throw new Error('Canvas text rendering is unavailable in this runtime');
      }

      context.fillStyle = '#fffaf5';
      context.fillRect(0, 0, width, height);

      context.globalAlpha = 0.2;
      context.fillStyle = '#ffb070';
      context.beginPath();
      context.arc(140, 170, 160, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = '#ffd39f';
      context.beginPath();
      context.arc(930, 250, 180, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = '#ffe8c7';
      context.beginPath();
      context.arc(300, 960, 190, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;

      this.drawRoundedRect(context, 84, 90, 912, 900, 34, '#ffffff', '#f3e3cf');
      this.drawRoundedRect(context, 124, 146, 170, 44, 14, '#fff3e6');

      context.fillStyle = '#ca470c';
      context.font = `700 22px ${fontStack}`;
      context.textAlign = 'center';
      context.fillText('TELURIO', 209, 175);

      context.fillStyle = '#111827';
      context.font = `700 62px ${fontStack}`;
      context.fillText('Harga Telur Hari Ini', width / 2, 285);

      context.fillStyle = '#6b7280';
      context.font = `500 30px ${fontStack}`;
      context.fillText('Acuan harga standar Provinsi Lampung', width / 2, 338);

      context.fillStyle = '#7c6f62';
      context.font = `600 30px ${fontStack}`;
      context.fillText('Harga Referensi Hari Ini', width / 2, 440);

      context.fillStyle = '#111827';
      context.font = `700 106px ${fontStack}`;
      context.fillText(`Rp ${formattedPrice}`, width / 2, 560);

      context.fillStyle = '#8d8779';
      context.font = `600 34px ${fontStack}`;
      context.fillText('/kg', width / 2, 605);

      this.drawRoundedRect(
        context,
        124,
        640,
        832,
        102,
        20,
        '#fff7ed',
        '#f5e6d2',
      );

      context.fillStyle = '#1f2937';
      context.font = `600 31px ${fontStack}`;
      context.textAlign = 'left';
      context.fillText(formattedDate, 154, 702);

      this.drawRoundedRect(context, 674, 662, 252, 58, 29, trendBadge.bgColor);
      context.fillStyle = trendBadge.textColor;
      context.font = `700 27px ${fontStack}`;
      context.textAlign = 'center';
      context.fillText(trendBadge.label, 800, 699);

      context.fillStyle = '#6b7280';
      context.font = `500 24px ${fontStack}`;
      context.textAlign = 'center';
      context.fillText(
        '*Harga dapat berbeda sesuai negosiasi tiap transaksi.',
        width / 2,
        860,
      );

      context.fillStyle = '#9ca3af';
      context.font = `500 22px ${fontStack}`;
      context.fillText('Sumber: Telurio', width / 2, 904);

      return {
        buffer: canvas.toBuffer('image/png'),
        contentType: 'image/png',
        filename: 'egg-price.png',
      };
    } catch {
      const safeDate = this.escapeXml(formattedDate);
      const safeTrendLabel = this.escapeXml(trendBadge.label);
      const safeTrendBg = this.escapeXml(trendBadge.bgColor);
      const safeTrendText = this.escapeXml(trendBadge.textColor);

      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <style>
      .font-main { font-family: ${fontStack}; }
    </style>
  </defs>
  <rect width="1080" height="1080" fill="#fffaf5"/>
  <circle cx="140" cy="170" r="160" fill="#ffb070" fill-opacity="0.2"/>
  <circle cx="930" cy="250" r="180" fill="#ffd39f" fill-opacity="0.2"/>
  <circle cx="300" cy="960" r="190" fill="#ffe8c7" fill-opacity="0.2"/>

  <rect x="84" y="90" width="912" height="900" rx="34" fill="#ffffff" stroke="#f3e3cf"/>
  <rect x="124" y="146" width="170" height="44" rx="14" fill="#fff3e6"/>

  <text x="209" y="175" text-anchor="middle" class="font-main" font-size="22" font-weight="700" fill="#ca470c">TELURIO</text>

  <text x="540" y="285" text-anchor="middle" class="font-main" font-size="62" font-weight="700" fill="#111827">Harga Telur Hari Ini</text>
  <text x="540" y="338" text-anchor="middle" class="font-main" font-size="30" font-weight="500" fill="#6b7280">Acuan harga standar Provinsi Lampung</text>
  <text x="540" y="440" text-anchor="middle" class="font-main" font-size="30" font-weight="600" fill="#7c6f62">Harga Referensi Hari Ini</text>

  <text x="540" y="560" text-anchor="middle" class="font-main" font-size="106" font-weight="700" fill="#111827">Rp ${formattedPrice}</text>
  <text x="540" y="605" text-anchor="middle" class="font-main" font-size="34" font-weight="600" fill="#8d8779">/kg</text>

  <rect x="124" y="640" width="832" height="102" rx="20" fill="#fff7ed" stroke="#f5e6d2"/>
  <text x="154" y="702" text-anchor="start" class="font-main" font-size="31" font-weight="600" fill="#1f2937">${safeDate}</text>

  <rect x="674" y="662" width="252" height="58" rx="29" fill="${safeTrendBg}"/>
  <text x="800" y="699" text-anchor="middle" class="font-main" font-size="27" font-weight="700" fill="${safeTrendText}">${safeTrendLabel}</text>

  <text x="540" y="860" text-anchor="middle" class="font-main" font-size="24" font-weight="500" fill="#6b7280">*Harga dapat berbeda sesuai negosiasi tiap transaksi.</text>
  <text x="540" y="904" text-anchor="middle" class="font-main" font-size="22" font-weight="500" fill="#9ca3af">Sumber: Telurio</text>
</svg>`;

      return {
        buffer: Buffer.from(svg, 'utf-8'),
        contentType: 'image/svg+xml',
        filename: 'egg-price.svg',
      };
    }
  }

  private drawRoundedRect(
    context: Canvas2DContext,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fillColor: string,
    strokeColor?: string,
  ) {
    const r = Math.min(radius, width / 2, height / 2);

    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
    context.lineTo(x + width, y + height - r);
    context.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
    context.lineTo(x + r, y + height);
    context.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
    context.lineTo(x, y + r);
    context.arc(x + r, y + r, r, Math.PI, (3 * Math.PI) / 2);
    context.closePath();

    context.fillStyle = fillColor;
    context.fill();

    if (strokeColor) {
      context.strokeStyle = strokeColor;
      context.lineWidth = 1;
      context.stroke();
    }
  }

  private canRenderCanvasText(
    canvasFactory: CanvasFactory,
    fontStack: string,
  ): boolean {
    try {
      const testCanvas = canvasFactory.createCanvas(320, 120);
      const testContext = testCanvas.getContext('2d');

      testContext.fillStyle = '#ffffff';
      testContext.fillRect(0, 0, 320, 120);

      testContext.fillStyle = '#111827';
      testContext.font = `700 32px ${fontStack}`;
      testContext.textAlign = 'left';
      testContext.fillText('Telurio', 16, 74);

      const pixels = testContext.getImageData(0, 0, 320, 120).data;
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = pixels[index + 3];

        if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
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

  private async getCurrentSnapshot(): Promise<PublicPriceSnapshot> {
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

  private buildTrendLabel(comparison: PublicPriceComparison): string {
    if (comparison.trend === 'NAIK') {
      return comparison.differencePerKg
        ? `Naik Rp ${new Intl.NumberFormat('id-ID').format(Number(comparison.differencePerKg))}`
        : 'Naik';
    }

    if (comparison.trend === 'TURUN') {
      return comparison.differencePerKg
        ? `Turun Rp ${new Intl.NumberFormat('id-ID').format(Number(comparison.differencePerKg))}`
        : 'Turun';
    }

    return 'Tetap';
  }

  private buildTrendBadge(comparison: PublicPriceComparison): {
    label: string;
    bgColor: string;
    textColor: string;
  } {
    const label = this.buildTrendLabel(comparison);

    if (comparison.trend === 'NAIK') {
      return {
        label: `↑ ${label}`,
        bgColor: '#dcfce7',
        textColor: '#166534',
      };
    }

    if (comparison.trend === 'TURUN') {
      return {
        label: `↓ ${label}`,
        bgColor: '#ffe4e6',
        textColor: '#9f1239',
      };
    }

    return {
      label: `• ${label}`,
      bgColor: '#f1f5f9',
      textColor: '#334155',
    };
  }

  private getFontStack() {
    return '"Plus Jakarta Sans", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  }

  private capitalizeFirst(value: string): string {
    if (!value) {
      return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
