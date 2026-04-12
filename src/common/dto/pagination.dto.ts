import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const sortOrders = ['asc', 'desc'] as const;
export type SortOrder = (typeof sortOrders)[number];

export type PaginationFilters = Record<string, unknown>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  sortBy: string;
  order: SortOrder;
  filters: PaginationFilters;
}

interface BuildPaginationMetaOptions {
  page: number;
  limit: number;
  total: number;
  sortBy: string;
  order: SortOrder;
  all?: boolean;
  filters?: PaginationFilters;
}

function sanitizeFilters(filters: PaginationFilters = {}): PaginationFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (value === undefined || value === null) {
        return false;
      }

      if (typeof value === 'string') {
        return value.trim().length > 0;
      }

      if (Array.isArray(value)) {
        return value.length > 0;
      }

      return true;
    }),
  );
}

export function buildPaginationMeta(
  options: BuildPaginationMetaOptions,
): PaginationMeta {
  const isAllMode = options.all === true;
  const page = isAllMode ? 1 : options.page;
  const limit = isAllMode ? options.total : options.limit;
  const totalPages = isAllMode
    ? options.total === 0
      ? 0
      : 1
    : options.total === 0
      ? 0
      : Math.ceil(options.total / options.limit);

  return {
    page,
    limit,
    total: options.total,
    totalPages,
    hasNextPage: isAllMode ? false : page < totalPages,
    hasPrevPage: isAllMode ? false : page > 1,
    sortBy: options.sortBy,
    order: options.order,
    filters: sanitizeFilters(options.filters),
  };
}

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsIn(sortOrders)
  order: SortOrder = 'desc';

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  all: boolean = false;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  get offset(): number | undefined {
    return this.all ? undefined : this.skip;
  }

  get take(): number | undefined {
    return this.all ? undefined : this.limit;
  }
}
