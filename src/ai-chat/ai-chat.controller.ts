import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common';
import { AiChatService } from './ai-chat.service';
import { ChatCompletionsDto } from './dto/chat.dto';

@Controller('ai-chat')
export class AiChatController {
  constructor(private readonly service: AiChatService) {}

  @Get('models')
  async models() {
    return await this.service.listModels();
  }

  @Get('tools')
  tools(@CurrentUser() user: { id: string; role: Role; username?: string }) {
    return this.service.listTools(user);
  }

  @Post('completions')
  async completions(
    @CurrentUser() user: { id: string; role: Role; username?: string },
    @Body() body: ChatCompletionsDto,
    @Res() res: Response,
  ) {
    await this.service.streamCompletions(user, body, res);
  }
}
