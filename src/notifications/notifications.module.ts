import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FonnteClient } from './fonnte.client';
import { GowaClient } from './gowa.client';
import { WHATSAPP_GATEWAY_CLIENT } from './notifications.constants';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [
    FonnteClient,
    GowaClient,
    {
      provide: WHATSAPP_GATEWAY_CLIENT,
      inject: [ConfigService, FonnteClient, GowaClient],
      useFactory: (
        configService: ConfigService,
        fonnteClient: FonnteClient,
        gowaClient: GowaClient,
      ) => {
        const provider = (
          configService.get<string>('WHATSAPP_PROVIDER') ?? 'fonnte'
        ).toLowerCase();
        return provider === 'gowa' ? gowaClient : fonnteClient;
      },
    },
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
