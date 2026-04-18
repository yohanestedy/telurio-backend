import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common';
import { PublicPricesService } from './public-prices.service';

@Public()
@Controller('public/prices')
export class PublicPricesController {
  constructor(private service: PublicPricesService) {}

  @Get('current')
  async current() {
    return await this.service.getCurrentPublicPrice();
  }

  @Get('share-text')
  async shareText() {
    return await this.service.getShareText();
  }

  @Get('share-image')
  async shareImage(@Res() response: Response) {
    const shareImage = await this.service.generateShareImage();

    response.setHeader('Content-Type', shareImage.contentType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${shareImage.filename}"`,
    );
    response.send(shareImage.buffer);
  }
}
