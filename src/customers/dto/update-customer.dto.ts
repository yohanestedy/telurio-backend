import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 255)
  address?: string | null;

  @IsOptional()
  @IsString()
  @Length(6, 30)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @Length(3, 255)
  deleteReason?: string;
}
