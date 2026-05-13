export interface WhatsAppSendMessagePayload {
  target: string;
  message: string;
}

export interface WhatsAppGatewayClient {
  sendMessage(payload: WhatsAppSendMessagePayload): Promise<unknown>;
}
