import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { PublicPricesController } from './public-prices.controller';
import { PublicPricesService } from './public-prices.service';

@Module({
  imports: [PrismaModule],
  controllers: [PublicPricesController],
  providers: [PublicPricesService],
})
export class PublicPricesModule {}
