import { Module } from '@nestjs/common';
import { EggPricesController } from './egg-prices.controller';
import { EggPricesService } from './egg-prices.service';

@Module({
  controllers: [EggPricesController],
  providers: [EggPricesService],
  exports: [EggPricesService],
})
export class EggPricesModule {}
