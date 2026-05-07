import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateGeneralExpenseCategoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;
}
