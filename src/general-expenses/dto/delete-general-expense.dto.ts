import { IsOptional, IsString, Length } from 'class-validator';

export class DeleteGeneralExpenseDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  deleteReason?: string;
}
