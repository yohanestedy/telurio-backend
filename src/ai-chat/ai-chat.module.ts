import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders';
import { CustomersModule } from '../customers';
import { CoopsModule } from '../coops';
import { StocksModule } from '../stocks';
import { ProductionsModule } from '../productions';
import { ReportsModule } from '../reports';
import { CalendarModule } from '../calendar';
import { ExpensesModule } from '../expenses';
import { GeneralExpensesModule } from '../general-expenses';
import { EggPricesModule } from '../egg-prices';
import { AuditLogsModule } from '../audit-logs';
import { CoopHealthModule } from '../coop-health';
import { UsersModule } from '../users';
import { PaymentsModule } from '../payments';
import { DeliveriesModule } from '../deliveries';
import { ExpenseCategoriesModule } from '../expense-categories';
import { GeneralExpenseCategoriesModule } from '../general-expense-categories';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';
import { AiToolsRegistry } from './ai-tools.registry';

@Module({
  imports: [
    OrdersModule,
    CustomersModule,
    CoopsModule,
    StocksModule,
    ProductionsModule,
    ReportsModule,
    CalendarModule,
    ExpensesModule,
    GeneralExpensesModule,
    EggPricesModule,
    AuditLogsModule,
    CoopHealthModule,
    UsersModule,
    PaymentsModule,
    DeliveriesModule,
    ExpenseCategoriesModule,
    GeneralExpenseCategoriesModule,
  ],
  controllers: [AiChatController],
  providers: [AiChatService, AiToolsRegistry],
})
export class AiChatModule {}
