import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { stockMovementDirectionValues } from './query-stock-movements.dto';

export class CreateManualStockAdjustmentDto {
  @IsUUID()
  coopId: string;

  @IsIn(stockMovementDirectionValues)
  direction: (typeof stockMovementDirectionValues)[number];

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantityKg: number;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  notes?: string;
}
