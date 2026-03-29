import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common';
import { CalendarService } from './calendar.service';
import { QueryCalendarDto } from './dto';

@Controller('calendar')
export class CalendarController {
  constructor(private service: CalendarService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OWNER, Role.OPERATOR)
  async list(
    @CurrentUser() user: { id: string; role: Role },
    @Query() query: QueryCalendarDto,
  ) {
    return await this.service.listEvents(user, query);
  }

  @Get(':date')
  @Roles(Role.ADMIN, Role.OWNER, Role.OPERATOR)
  async detail(
    @Param('date') date: string,
    @CurrentUser() user: { id: string; role: Role },
  ) {
    return await this.service.getDayEvents(user, date);
  }
}
