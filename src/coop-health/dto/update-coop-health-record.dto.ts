import { PartialType } from '@nestjs/mapped-types';
import { CreateCoopHealthRecordDto } from './create-coop-health-record.dto';

export class UpdateCoopHealthRecordDto extends PartialType(
  CreateCoopHealthRecordDto,
) {}
