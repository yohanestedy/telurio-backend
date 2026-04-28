import { IsIn, IsOptional, IsUUID } from 'class-validator';

export const productionAnalyticsPeriods = ['1w', '1m', '3m', '6m'] as const;
export type ProductionAnalyticsPeriod =
  (typeof productionAnalyticsPeriods)[number];

export class QueryProductionAnalyticsDto {
  @IsOptional()
  @IsIn(productionAnalyticsPeriods)
  period: ProductionAnalyticsPeriod = '1w';

  @IsOptional()
  @IsUUID()
  coopId?: string;
}
