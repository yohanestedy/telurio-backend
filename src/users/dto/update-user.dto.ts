import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { CreateUserCoopAccessDto } from './create-user-coop-access.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique((item: CreateUserCoopAccessDto) => item.coopId)
  @ValidateNested({ each: true })
  @Type(() => CreateUserCoopAccessDto)
  coopAccesses?: CreateUserCoopAccessDto[];
}
