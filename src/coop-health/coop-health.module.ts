import { Module } from '@nestjs/common';
import { CoopHealthController } from './coop-health.controller';
import { CoopHealthService } from './coop-health.service';

@Module({
  controllers: [CoopHealthController],
  providers: [CoopHealthService],
})
export class CoopHealthModule {}
