import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { AllExceptionsFilter } from './common/filters';
import {
  BigIntSerializerInterceptor,
  ResponseWrapInterceptor,
} from './common/interceptors';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: BigIntSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseWrapInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
