import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, Permission, Roles } from '../../common/decorators';
import { requirePro } from '../../common/guards';
import { CreateRequestDto, InboxQuery, ListRequestsQuery, UpdateRequestDto } from './requests.dto';
import { RequestsService } from './requests.service';

@ApiTags('requests')
@ApiBearerAuth()
@Controller('requests')
export class RequestsController {
  constructor(private requests: RequestsService) {}

  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) {
    return this.requests.create(user, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser, @Query() q: ListRequestsQuery) {
    return this.requests.listMine(user, q);
  }

  /** Professional inbox of matching requests. */
  @Get('inbox')
  inbox(@CurrentUser() user: AuthUser, @Query() q: InboxQuery) {
    requirePro(user);
    return this.requests.inbox(user, q);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.detail(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRequestDto) {
    return this.requests.update(user, id, dto);
  }

  @Post(':id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.publish(user, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.requests.cancel(user, id, reason);
  }

  @Post(':id/attachments')
  attach(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body('fileKey') fileKey: string) {
    return this.requests.addAttachment(user, id, fileKey);
  }

  @Post(':id/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    requirePro(user);
    return this.requests.decline(user, id);
  }

  @Permission('jobs.manage', 'users.view')
  @Get(':id/matches')
  matches(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.matchExplanation(user, id);
  }
}
