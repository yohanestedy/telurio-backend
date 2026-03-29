import { IsString, Length } from 'class-validator';

export class DeleteProductionDto {
  @IsString()
  @Length(3, 255)
  deleteReason: string;
}
