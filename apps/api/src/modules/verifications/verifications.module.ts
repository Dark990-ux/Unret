import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { VerificationType } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { requirePro } from '../../common/guards';
import { PageQuery, pageResult, paginate } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../files/storage.service';
import { NotificationsService } from '../notifications/notifications.service';

class SubmitDto {
  @IsEnum(VerificationType) type: VerificationType;
  @IsOptional() @IsString() categoryId?: string;
  @IsString() documentKey: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class DecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

const LABELS: Record<VerificationType, string> = {
  IDENTITY: 'Identity verification', BUSINESS: 'Business verification',
  QUALIFICATION: 'Qualification verification', ADDITIONAL: 'Additional check',
};

@Injectable()
export class VerificationsService {
  constructor(private prisma: PrismaService, private storage: StorageService, private notifications: NotificationsService, private audit: AuditService) {}

  async submit(user: AuthUser, dto: SubmitDto) {
    const pid = requirePro(user);
    this.storage.assertOwned(dto.documentKey, user.id, 'verification');
    if (dto.type === 'QUALIFICATION') {
      if (!dto.categoryId) throw new BadRequestException('Select the service this qualification applies to');
      const offers = await this.prisma.professionalService.findFirst({ where: { professionalId: pid, categoryId: dto.categoryId } });
      if (!offers) throw new BadRequestException('You do not offer this service');
    }
    const pending = await this.prisma.verification.count({ where: { professionalId: pid, type: dto.type, categoryId: dto.categoryId ?? null, status: 'PENDING' } });
    if (pending) throw new BadRequestException('A verification of this type is already awaiting review');
    const v = await this.prisma.verification.create({
      data: { professionalId: pid, type: dto.type, categoryId: dto.type === 'QUALIFICATION' ? dto.categoryId : null, documentKey: dto.documentKey, documentName: dto.documentKey.split('/').pop()!, notes: dto.notes },
    });
    await this.audit.log({ actorId: user.id, action: 'verification.submit', entityType: 'Verification', entityId: v.id, metadata: { type: dto.type } });
    return { id: v.id, type: v.type, status: v.status, createdAt: v.createdAt };
  }

  mine(user: AuthUser) {
    return this.prisma.verification.findMany({
      where: { professionalId: requirePro(user) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, categoryId: true, status: true, reviewNote: true, createdAt: true, reviewedAt: true, expiresAt: true, documentName: true },
    });
  }

  async queue(q: PageQuery & { status?: string }) {
    const where = { status: (q.status ?? 'PENDING') as any };
    const [rows, total] = await Promise.all([
      this.prisma.verification.findMany({
        where, orderBy: { createdAt: 'asc' }, ...paginate(q),
        include: {
          professional: { select: { id: true, businessName: true, accountType: true, countryCode: true, user: { select: { id: true, name: true, email: true } }, company: { select: { legalName: true, registrationNumber: true } } } },
          category: { include: { translations: true } },
          reviewedBy: { select: { name: true } },
        },
      }),
      this.prisma.verification.count({ where }),
    ]);
    return pageResult(rows.map((v) => ({ ...v, documentKey: undefined })), total, q);
  }

  /** Short-lived signed link to the private document. Every access is audit-logged. */
  async documentUrl(admin: AuthUser, id: string) {
    const v = await this.prisma.verification.findUnique({ where: { id } });
    if (!v) throw new NotFoundException();
    await this.audit.log({ actorId: admin.id, action: 'admin.verification.document_access', entityType: 'Verification', entityId: id });
    return { url: this.storage.signedUrl(v.documentKey, 5 * 60), expiresInSeconds: 300 };
  }

  async decide(admin: AuthUser, id: string, dto: DecisionDto) {
    const v = await this.prisma.verification.findUnique({ where: { id }, include: { professional: { select: { userId: true } } } });
    if (!v) throw new NotFoundException();
    if (v.status !== 'PENDING') throw new BadRequestException('Already reviewed');
    if (dto.decision === 'REJECTED' && !dto.note) throw new BadRequestException('Please explain the rejection so the professional can fix it');
    const updated = await this.prisma.verification.update({
      where: { id },
      data: { status: dto.decision, reviewNote: dto.note, reviewedById: admin.id, reviewedAt: new Date(), expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null },
    });
    await this.audit.log({ actorId: admin.id, action: `admin.verification.${dto.decision.toLowerCase()}`, entityType: 'Verification', entityId: id, metadata: { type: v.type, note: dto.note } });
    await this.notifications.notify({
      userId: v.professional.userId, type: 'VERIFICATION_UPDATED',
      title: `${LABELS[v.type]} ${dto.decision === 'APPROVED' ? 'approved ✓' : 'not approved'}`,
      body: dto.note ?? (dto.decision === 'APPROVED' ? 'The badge is now shown on your profile.' : ''),
      data: { verificationId: id, url: '/pro/verification' },
    });
    return updated;
  }
}

@ApiTags('verifications')
@ApiBearerAuth()
@Controller('verifications')
export class VerificationsController {
  constructor(private v: VerificationsService) {}

  @Post()
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitDto) {
    return this.v.submit(user, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.v.mine(user);
  }

  @Roles('ADMIN')
  @Get('queue')
  queue(@Query() q: PageQuery, @Query('status') status?: string) {
    return this.v.queue({ ...q, status });
  }

  @Roles('ADMIN')
  @Get(':id/document')
  document(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.v.documentUrl(user, id);
  }

  @Roles('ADMIN')
  @Post(':id/decision')
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.v.decide(user, id, dto);
  }
}

@Module({ controllers: [VerificationsController], providers: [VerificationsService] })
export class VerificationsModule {}
