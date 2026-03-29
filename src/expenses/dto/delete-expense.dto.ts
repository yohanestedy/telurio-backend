import { IsString, Length } from 'class-validator';

export class DeleteExpenseDto {
  @IsString()
  @Length(3, 255)
  deleteReason: string;
}
