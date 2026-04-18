import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks';
import { ProductionsController } from './productions.controller';
import { ProductionsService } from './productions.service';

@Module({
  imports: [StocksModule],
  controllers: [ProductionsController],
  providers: [ProductionsService],
})
export class ProductionsModule {}
