import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WhatsAppGatewayClient,
  WhatsAppSendMessagePayload,
} from './whatsapp-gateway.client';

interface GowaSendResponse {
  code?: string;
  message?: string;
  results?: {
    message_id?: string;
    status?: string;
  };
}

@Injectable()
export class GowaClient implements WhatsAppGatewayClient {
  private readonly logger = new Logger(GowaClient.name);

  constructor(private readonly configService: ConfigService) {}

  async sendMessage(payload: WhatsAppSendMessagePayload) {
    const baseUrl =
      this.configService.get<string>('GOWA_API_BASE_URL') ??
      'https://wa.yohanestedy.app';
    const username = this.configService.get<string>('GOWA_API_USERNAME');
    const password = this.configService.get<string>('GOWA_API_PASSWORD');
    const deviceId = this.configService.get<string>('GOWA_DEVICE_ID');

    if (!username || !password || !deviceId) {
      this.logger.warn(
        'GOWA_API_USERNAME/GOWA_API_PASSWORD/GOWA_DEVICE_ID is not configured; WhatsApp message skipped',
      );
      return null;
    }

    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const response = await fetch(`${baseUrl}/send/message`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        'X-Device-Id': deviceId,
      },
      body: JSON.stringify({
        phone: this.normalizePhone(payload.target),
        message: payload.message,
      }),
    });

    const responseBody = (await response
      .json()
      .catch(() => null)) as GowaSendResponse | null;

    if (!response.ok || responseBody?.code !== 'SUCCESS') {
      throw new Error(
        responseBody?.message ??
          `Gowa request failed with status ${response.status}`,
      );
    }

    return responseBody;
  }

  private normalizePhone(value: string) {
    const normalized = value.trim();
    if (normalized.endsWith('@s.whatsapp.net')) {
      return normalized;
    }

    const digits = normalized.replace(/\D/g, '');
    return `${digits}@s.whatsapp.net`;
  }
}
