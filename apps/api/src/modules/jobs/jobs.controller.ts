import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { AssignDto, CancelJobDto, DisputeDto, JobsQuery, ProposeChangeDto, RespondChangeDto } from './jobs.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private jobs: JobsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: JobsQuery) {
    return this.jobs.list(user, q);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.detail(user, id);
  }

  @Post(':id/start')
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.start(user, id);
  }

  @Post(':id/confirm-completion')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.confirmCompletion(user, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CancelJobDto) {
    return this.jobs.cancel(user, id, dto.reason);
  }

  @Post(':id/changes')
  propose(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ProposeChangeDto) {
    return this.jobs.proposeChange(user, id, dto);
  }

  @Post(':id/changes/:changeId/respond')
  respond(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('changeId') changeId: string, @Body() dto: RespondChangeDto) {
    return this.jobs.respondChange(user, id, changeId, dto.decision);
  }

  @Post(':id/changes/:changeId/withdraw')
  withdrawChange(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('changeId') changeId: string) {
    return this.jobs.withdrawChange(user, id, changeId);
  }

  @Post(':id/disputes')
  dispute(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DisputeDto) {
    return this.jobs.openDispute(user, id, dto);
  }

  @Post(':id/assign')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignDto) {
    return this.jobs.assign(user, id, dto.userId);
  }
}
