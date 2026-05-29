import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export class ChatMessageDto {
  @IsString()
  @IsIn(['system', 'user', 'assistant', 'tool'])
  role!: ChatMessageRole;

  @IsOptional()
  @IsString()
  content?: string | null;

  @IsOptional()
  @IsString()
  tool_call_id?: string;

  @IsOptional()
  @IsArray()
  tool_calls?: unknown[];
}

export class ChatCompletionsDto {
  @IsString()
  model!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @IsOptional()
  @IsString()
  clientTimezone?: string;
}

export interface ModelOption {
  id: string;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  permission: string;
}
