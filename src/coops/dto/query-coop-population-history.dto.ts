import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryCoopPopulationHistoryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return 20;
    }
    return Number(value);
  })
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 20;
}
