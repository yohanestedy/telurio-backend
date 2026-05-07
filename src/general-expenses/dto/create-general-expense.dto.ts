import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateGeneralExpenseDto {
  @IsDateString()
  date: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  amount: number;

  @IsString()
  @Length(1, 255)
  description: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  notes?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}
