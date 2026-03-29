import { IsString, Length } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  @Length(2, 120)
  name: string;
}
