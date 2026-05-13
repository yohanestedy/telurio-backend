import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WhatsAppGatewayClient,
  WhatsAppSendMessagePayload,
} from './whatsapp-gateway.client';

interface FonnteSendResponse {
  status?: boolean;
  detail?: string;
  id?: number[];
  process?: string;
  requestid?: number;
  target?: string[];
}

@Injectable()
export class FonnteClient implements WhatsAppGatewayClient {
  private readonly logger = new Logger(FonnteClient.name);

  constructor(private readonly configService: ConfigService) {}

  async sendMessage(payload: WhatsAppSendMessagePayload) {
    const token = this.configService.get<string>('FONNTE_TOKEN');
    const apiUrl =
      this.configService.get<string>('FONNTE_API_URL') ??
      'https://api.fonnte.com/send';

    if (!token) {
      this.logger.warn(
        'FONNTE_TOKEN is not configured; WhatsApp message skipped',
      );
      return null;
    }

    const form = new FormData();
    form.append('target', payload.target);
    form.append('message', payload.message);
    form.append(
      'countryCode',
      this.configService.get<string>('FONNTE_COUNTRY_CODE') ?? '62',
    );
    form.append('delay', this.configService.get<string>('FONNTE_DELAY') ?? '1');
    form.append(
      'typing',
      this.configService.get<string>('FONNTE_TYPING') ?? 'true',
    );

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: token,
      },
      body: form,
    });

    const responseBody = (await response
      .json()
      .catch(() => null)) as FonnteSendResponse | null;

    if (!response.ok || responseBody?.status === false) {
      throw new Error(
        responseBody?.detail ??
          `Fonnte request failed with status ${response.status}`,
      );
    }

    return responseBody;
  }
}
