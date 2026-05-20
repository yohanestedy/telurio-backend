import { Module } from '@nestjs/common';
import { GeneralExpenseCategoriesController } from './general-expense-categories.controller';
import { GeneralExpenseCategoriesService } from './general-expense-categories.service';

@Module({
  controllers: [GeneralExpenseCategoriesController],
  providers: [GeneralExpenseCategoriesService],
  exports: [GeneralExpenseCategoriesService],
})
export class GeneralExpenseCategoriesModule {}
