import { IsString, Length } from 'class-validator';

export class CreateGeneralExpenseCategoryDto {
  @IsString()
  @Length(1, 100)
  name: string;
}
