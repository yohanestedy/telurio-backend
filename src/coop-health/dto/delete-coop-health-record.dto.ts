import { IsString, Length } from 'class-validator';

export class DeleteCoopHealthRecordDto {
  @IsString()
  @Length(1, 255)
  deleteReason: string;
}
