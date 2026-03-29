import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { NotFoundException } from '../common';

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

@Injectable()
export class PublicPricesService {
  constructor(private prisma: PrismaService) {}

  async getCurrentPublicPrice() {
    const current = await this.findCurrentPrice();

    return {
      effectiveDate: current.effectiveDate,
      pricePerKg: current.pricePerKg,
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

  async generateShareImage(): Promise<Buffer> {
    const canvasFactory =
      (await import('@napi-rs/canvas')) as unknown as CanvasFactory;
    const current = await this.findCurrentPrice();

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

    return canvas.toBuffer('image/png');
  }

  private async findCurrentPrice() {
    const today = new Date();

    const current =
      (await this.prisma.eggPrice.findFirst({
        where: {
          deletedAt: null,
          effectiveDate: { lte: today },
        },
        orderBy: { effectiveDate: 'desc' },
        select: {
          effectiveDate: true,
          pricePerKg: true,
        },
      })) ??
      (await this.prisma.eggPrice.findFirst({
        where: { deletedAt: null },
        orderBy: { effectiveDate: 'desc' },
        select: {
          effectiveDate: true,
          pricePerKg: true,
        },
      }));

    if (!current) {
      throw new NotFoundException('No active egg price found');
    }

    return current;
  }
}
