import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateUserCoopAccessDto } from './create-user-coop-access.dto';

export class CreateUserDto {
  @IsString()
  @Length(2, 100)
  name: string;

  @IsString()
  @Length(3, 50)
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(Role)
  @IsIn([Role.OWNER, Role.OPERATOR])
  role: Role;

  @IsOptional()
  @IsArray()
  @ArrayUnique((item: CreateUserCoopAccessDto) => item.coopId)
  @ValidateNested({ each: true })
  @Type(() => CreateUserCoopAccessDto)
  coopAccesses?: CreateUserCoopAccessDto[];
}
