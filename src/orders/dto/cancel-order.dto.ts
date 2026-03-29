import { IsOptional, IsString, Length } from 'class-validator';

export class CancelOrderDto {
  @IsString()
  @Length(3, 255)
  cancelReason: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  cancelNotes?: string;
}
