import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';

const DEFAULT_USER_SESSION_CLEANUP_RETENTION_DAYS = 14;

@Injectable()
export class UserSessionCleanupService {
  private readonly logger = new Logger(UserSessionCleanupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async cleanupOldSessions() {
    if (!this.isCleanupEnabled()) {
      return;
    }

    const cutoff = this.getRetentionCutoffDate(this.getRetentionDays());
    const result = await this.prisma.userSession.deleteMany({
      where: {
        OR: [
          {
            revokedAt: {
              lt: cutoff,
            },
          },
          {
            expiresAt: {
              lt: cutoff,
            },
          },
        ],
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Deleted ${result.count} old user session(s) before ${cutoff.toISOString()}`,
      );
    }
  }

  private isCleanupEnabled() {
    return (
      this.configService.get<string>(
        'USER_SESSION_CLEANUP_SCHEDULER_ENABLED',
      ) === 'true'
    );
  }

  private getRetentionDays() {
    const configuredDays = Number(
      this.configService.get<string>('USER_SESSION_CLEANUP_RETENTION_DAYS'),
    );

    if (Number.isInteger(configuredDays) && configuredDays > 0) {
      return configuredDays;
    }

    return DEFAULT_USER_SESSION_CLEANUP_RETENTION_DAYS;
  }

  private getRetentionCutoffDate(retentionDays: number) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    return cutoff;
  }
}
