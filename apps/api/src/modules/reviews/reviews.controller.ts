import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Public } from '../../common/decorators';
import { requirePro } from '../../common/guards';
import { PageQuery, pageResult, paginate } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProfessionalsService, shortName } from '../professionals/professionals.service';

class CreateReviewDto {
  @IsString() jobId: string;
  @IsInt() @Min(1) @Max(5) overall: number;
  @IsInt() @Min(1) @Max(5) communication: number;
  @IsInt() @Min(1) @Max(5) quality: number;
  @IsInt() @Min(1) @Max(5) punctuality: number;
  @IsOptional() @IsString() @MaxLength(3000) text?: string;
}
class RespondDto {
  @IsString() @Length(2, 2000) response: string;
}

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService, private pros: ProfessionalsService, private notifications: NotificationsService, private audit: AuditService) {}

  /** Only the customer of a COMPLETED job may leave a (verified-job) review, once. */
  async create(user: AuthUser, dto: CreateReviewDto) {
    const job = await this.prisma.job.findUnique({ where: { id: dto.jobId }, include: { review: true, professional: { select: { userId: true } }, request: { select: { title: true } } } });
    if (!job || job.customerId !== user.id) throw new NotFoundException('Job not found');
    if (job.status !== 'COMPLETED') throw new BadRequestException('You can review a job once it is completed');
    if (job.review) throw new BadRequestException('You already reviewed this job');
    const review = await this.prisma.review.create({
      data: {
        jobId: job.id, customerId: user.id, professionalId: job.professionalId, isVerifiedJob: true,
        overall: dto.overall, communication: dto.communication, quality: dto.quality, punctuality: dto.punctuality, text: dto.text?.trim() || null,
      },
    });
    await this.pros.recomputeReputation(job.professionalId);
    await this.audit.log({ actorId: user.id, action: 'review.create', entityType: 'Review', entityId: review.id, metadata: { jobId: job.id, overall: dto.overall } });
    await this.notifications.notify({
      userId: job.professional.userId, type: 'REVIEW_RECEIVED', title: `New ${dto.overall}★ review`,
      body: `For "${job.request.title}"`, data: { reviewId: review.id, url: `/pro/reviews` },
    });
    return review;
  }

  async respond(user: AuthUser, reviewId: string, response: string) {
    const pid = requirePro(user);
    const r = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!r || r.professionalId !== pid) throw new NotFoundException();
    if (r.professionalResponse) throw new BadRequestException('You already responded to this review');
    return this.prisma.review.update({ where: { id: reviewId }, data: { professionalResponse: response, respondedAt: new Date() } });
  }

  async forProfessional(professionalId: string, q: PageQuery) {
    const where = { professionalId, status: 'PUBLISHED' as const };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q), include: { customer: { select: { name: true } } } }),
      this.prisma.review.count({ where }),
    ]);
    return pageResult(rows.map((r) => ({ ...r, customerId: undefined, customer: undefined, customerName: shortName(r.customer.name) })), total, q);
  }

  async mine(user: AuthUser) {
    if (!user.professionalId) throw new ForbiddenException();
    return this.prisma.review.findMany({
      where: { professionalId: user.professionalId },
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { name: true } }, job: { select: { id: true, request: { select: { title: true } } } } },
    });
  }
}

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private reviews: ReviewsService) {}

  @ApiBearerAuth()
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user, dto);
  }

  @ApiBearerAuth()
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.reviews.mine(user);
  }

  @ApiBearerAuth()
  @Post(':id/respond')
  respond(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RespondDto) {
    return this.reviews.respond(user, id, dto.response);
  }

  @Public()
  @Get('professional/:id')
  forPro(@Param('id') id: string, @Query() q: PageQuery) {
    return this.reviews.forProfessional(id, q);
  }
}

@Module({ controllers: [ReviewsController], providers: [ReviewsService] })
export class ReviewsModule {}
