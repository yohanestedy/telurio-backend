import { Module } from '@nestjs/common';
import { FonnteClient } from './fonnte.client';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [FonnteClient, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
