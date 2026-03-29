import { Module } from '@nestjs/common';
import { ProductionsController } from './productions.controller';
import { ProductionsService } from './productions.service';

@Module({
  controllers: [ProductionsController],
  providers: [ProductionsService],
})
export class ProductionsModule {}
