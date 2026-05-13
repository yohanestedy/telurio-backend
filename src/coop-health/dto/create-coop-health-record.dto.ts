import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { CoopHealthRecordType } from '@prisma/client';

export class CreateCoopHealthRecordDto {
  @IsDateString()
  date: string;

  @IsUUID()
  coopId: string;

  @IsEnum(CoopHealthRecordType)
  type: CoopHealthRecordType;

  @IsString()
  @Length(1, 255)
  description: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  reminderDate?: string;

  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;
}
