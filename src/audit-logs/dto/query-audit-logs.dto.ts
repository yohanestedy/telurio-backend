import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationDto } from '../../common';

export const auditLogSortFields = [
  'createdAt',
  'entityType',
  'actionType',
] as const;
export type AuditLogSortField = (typeof auditLogSortFields)[number];

export class QueryAuditLogsDto extends PaginationDto {
  @IsOptional()
  @IsIn(auditLogSortFields)
  sortBy: AuditLogSortField = 'createdAt';

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsUUID()
  coopId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
