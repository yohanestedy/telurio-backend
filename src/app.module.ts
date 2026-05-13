import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma';
import { AuthModule, JwtAuthGuard, RolesGuard } from './auth';
import { UsersModule } from './users';
import { CoopsModule } from './coops';
import { CustomersModule } from './customers';
import { EggPricesModule } from './egg-prices';
import { ProductionsModule } from './productions';
import { OrdersModule } from './orders';
import { DeliveriesModule } from './deliveries';
import { PaymentsModule } from './payments';
import { ExpenseCategoriesModule } from './expense-categories';
import { ExpensesModule } from './expenses';
import { ReportsModule } from './reports';
import { CalendarModule } from './calendar';
import { AuditLogsModule } from './audit-logs';
import { PublicPricesModule } from './public-prices';
import { StocksModule } from './stocks';
import { GeneralExpensesModule } from './general-expenses';
import { GeneralExpenseCategoriesModule } from './general-expense-categories';
import { CoopHealthModule } from './coop-health';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/filters';
import {
  BigIntSerializerInterceptor,
  ResponseWrapInterceptor,
} from './common/interceptors';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    CoopsModule,
    CustomersModule,
    EggPricesModule,
    ProductionsModule,
    OrdersModule,
    DeliveriesModule,
    PaymentsModule,
    ExpenseCategoriesModule,
    ExpensesModule,
    ReportsModule,
    CalendarModule,
    AuditLogsModule,
    PublicPricesModule,
    StocksModule,
    GeneralExpensesModule,
    GeneralExpenseCategoriesModule,
    CoopHealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: BigIntSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseWrapInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
