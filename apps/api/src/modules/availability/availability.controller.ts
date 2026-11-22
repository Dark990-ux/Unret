import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser, Public } from '../../common/decorators';
import { requirePro } from '../../common/guards';
import { PrismaService } from '../../common/prisma.service';
import { AvailabilityAlertsService } from './alerts.service';
import { AvailabilityService } from './availability.service';

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
class RuleDto {
  @IsInt() @Min(0) @Max(6) weekday: number;
  @Matches(HM) startTime: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/) endTime: string;
  @IsOptional() @IsBoolean() isEmergency?: boolean;
}
class RulesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => RuleDto) rules: RuleDto[];
}
class BlockDto {
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
class PeriodDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate: string;
  @IsOptional() @IsString() @MaxLength(120) note?: string;
}
class SettingsDto {
  @IsOptional() @IsBoolean() acceptingRequests?: boolean;
  @IsOptional() @IsBoolean() emergencyAvailable?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(500) serviceRadiusKm?: number;
  @IsOptional() @IsString() timezone?: string;
}

@ApiTags('availability')
@Controller('availability')
export class AvailabilityController {
  constructor(private availability: AvailabilityService, private prisma: PrismaService, private alerts: AvailabilityAlertsService) {}

  /** After a change that can free up time: tell customers waiting for this professional (in the background). */
  private freed<T>(pid: string, result: T): T {
    void this.alerts.check(pid);
    return result;
  }

  @ApiBearerAuth()
  @Get('me')
  async mine(@CurrentUser() user: AuthUser) {
    const pid = requirePro(user);
    const [rules, blocks, periods, pro] = await Promise.all([
      this.availability.getRules(pid),
      this.availability.listBlocks(pid),
      this.availability.listPeriods(pid),
      this.prisma.professionalProfile.findUniqueOrThrow({
        where: { id: pid },
        select: { acceptingRequests: true, emergencyAvailable: true, serviceRadiusKm: true, timezone: true },
      }),
    ]);
    return { rules, blocks, periods, settings: pro };
  }

  @ApiBearerAuth()
  @Put('me/rules')
  async setRules(@CurrentUser() user: AuthUser, @Body() dto: RulesDto) {
    const pid = requirePro(user);
    return this.freed(pid, await this.availability.setRules(pid, dto.rules));
  }

  @ApiBearerAuth()
  @Put('me/settings')
  async settings(@CurrentUser() user: AuthUser, @Body() dto: SettingsDto) {
    if (dto.timezone) {
      try { new Intl.DateTimeFormat('en', { timeZone: dto.timezone }); } catch { dto.timezone = undefined; }
    }
    const pid = requirePro(user);
    return this.freed(pid, await this.prisma.professionalProfile.update({
      where: { id: pid },
      data: dto,
      select: { acceptingRequests: true, emergencyAvailable: true, serviceRadiusKm: true, timezone: true },
    }));
  }

  @ApiBearerAuth()
  @Post('me/blocks')
  addBlock(@CurrentUser() user: AuthUser, @Body() dto: BlockDto) {
    return this.availability.addBlock(requirePro(user), new Date(dto.startsAt), new Date(dto.endsAt), dto.reason);
  }

  @ApiBearerAuth()
  @Post('me/periods')
  async addPeriod(@CurrentUser() user: AuthUser, @Body() dto: PeriodDto) {
    const pid = requirePro(user);
    return this.freed(pid, await this.availability.addPeriod(pid, dto.startDate, dto.endDate, dto.note));
  }

  @ApiBearerAuth()
  @Delete('me/periods/:id')
  async removePeriod(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const pid = requirePro(user);
    return this.freed(pid, await this.availability.removePeriod(pid, id));
  }

  @ApiBearerAuth()
  @Delete('me/blocks/:id')
  async removeBlock(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const pid = requirePro(user);
    return this.freed(pid, await this.availability.removeBlock(pid, id));
  }

  // ── "Notify me when free" (customers) ──

  @ApiBearerAuth()
  @Get('alerts/mine')
  myAlerts(@CurrentUser() user: AuthUser) {
    return this.alerts.mine(user);
  }

  @ApiBearerAuth()
  @Get(':professionalId/alert')
  alertStatus(@CurrentUser() user: AuthUser, @Param('professionalId') id: string) {
    return this.alerts.status(user, id);
  }

  @ApiBearerAuth()
  @Post(':professionalId/alert')
  subscribe(@CurrentUser() user: AuthUser, @Param('professionalId') id: string) {
    return this.alerts.subscribe(user, id);
  }

  @ApiBearerAuth()
  @Delete(':professionalId/alert')
  unsubscribe(@CurrentUser() user: AuthUser, @Param('professionalId') id: string) {
    return this.alerts.unsubscribe(user, id);
  }

  @ApiBearerAuth()
  @Get('me/appointments')
  appointments(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const f = from ? new Date(from) : new Date(Date.now() - 7 * 864e5);
    const t = to ? new Date(to) : new Date(Date.now() + 60 * 864e5);
    return this.prisma.appointment.findMany({
      where: { professionalId: requirePro(user), status: 'RESERVED', startsAt: { lt: t }, endsAt: { gt: f } },
      include: { job: { select: { id: true, status: true, request: { select: { title: true, city: true } }, customer: { select: { name: true } } } } },
      orderBy: { startsAt: 'asc' },
    });
  }

  /** Public: month-style calendar of free / partly booked / unavailable days. */
  @Public()
  @Get(':professionalId/calendar')
  calendar(@Param('professionalId') id: string, @Query('from') from?: string, @Query('days') days = '42') {
    const today = new Date().toISOString().slice(0, 10);
    return this.availability.calendar(id, from ?? today, Number(days) || 42);
  }

  /** Public: free appointment slots for a professional (shown when comparing offers). */
  @Public()
  @Get(':professionalId/slots')
  slots(@Param('professionalId') id: string, @Query('from') from?: string, @Query('days') days = '7', @Query('duration') duration = '60') {
    const f = from ? new Date(from) : new Date();
    const d = Math.min(Math.max(Number(days) || 7, 1), 31);
    return this.availability.freeSlots(id, f, new Date(f.getTime() + d * 864e5), Math.min(Math.max(Number(duration) || 60, 30), 600));
  }
}
