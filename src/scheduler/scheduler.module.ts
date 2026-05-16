import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
