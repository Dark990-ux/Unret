import { Body, Controller, Injectable, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { ReportTargetType } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';

class ReportDto {
  @IsEnum(ReportTargetType) targetType: ReportTargetType;
  @IsString() targetId: string;
  @IsString() @Length(3, 120) reason: string;
  @IsOptional() @IsString() @MaxLength(3000) details?: string;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}
  async create(user: AuthUser, dto: ReportDto) {
    const r = await this.prisma.report.create({ data: { reporterId: user.id, ...dto } });
    // Reported content stays visible until an admin decides, so reports cannot be used to silence reviews.
    return { id: r.id, status: r.status };
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: ReportDto) {
    return this.reports.create(user, dto);
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
