import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserSessionCleanupService } from '../auth/user-session-cleanup.service';
import { NotificationsService } from '../notifications/notifications.service';

const JAKARTA_TIME_ZONE = 'Asia/Jakarta';

@Injectable()
export class SchedulerService {
  constructor(
    private readonly userSessionCleanupService: UserSessionCleanupService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 0 * * *', { timeZone: JAKARTA_TIME_ZONE })
  async runUserSessionCleanup() {
    await this.userSessionCleanupService.cleanupOldSessions();
  }

  @Cron('0 6 * * *', { timeZone: JAKARTA_TIME_ZONE })
  async runMorningOrdersSummary() {
    await this.notificationsService.runMorningOrdersSummary();
  }

  @Cron('0 17,19 * * *', { timeZone: JAKARTA_TIME_ZONE })
  async runScheduledOrderReminder() {
    await this.notificationsService.runScheduledOrderReminder();
  }
}
