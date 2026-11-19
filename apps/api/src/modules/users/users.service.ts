import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../files/storage.service';
import { UpdateMeDto } from './users.controller';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private storage: StorageService, private audit: AuditService) {}

  async update(userId: string, dto: UpdateMeDto) {
    if (dto.avatarKey) this.storage.assertOwned(dto.avatarKey, userId, 'avatar');
    const u = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: { id: true, name: true, preferredLanguage: true, addressText: true, city: true, avatarKey: true },
    });
    return { ...u, avatarUrl: this.storage.signedUrl(u.avatarKey) };
  }

  async exportData(userId: string) {
    await this.audit.log({ actorId: userId, action: 'user.data_export', entityType: 'User', entityId: userId });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        professional: { include: { services: true, portfolio: true, availabilityRules: true, verifications: { select: { id: true, type: true, status: true, createdAt: true } } } },
        requests: { include: { attachments: true } },
        customerJobs: { include: { changes: true, payments: true } },
        reviewsWritten: true,
        messages: { select: { id: true, conversationId: true, body: true, createdAt: true } },
        notificationPrefs: true,
        savedProfessionals: true,
        reports: true,
      },
    });
    const { passwordHash, mfaSecret, ...safe } = user;
    return { exportedAt: new Date().toISOString(), format: 'unret-export-v1', data: safe };
  }

  /**
   * Anonymizes the account. Job, payment and review records are retained (with the personal
   * identifiers removed) because they are needed for the other party, legal and accounting obligations.
   */
  async deleteAccount(userId: string) {
    const active = await this.prisma.job.count({
      where: {
        status: { in: ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'DISPUTED'] },
        OR: [{ customerId: userId }, { professional: { userId } }],
      },
    });
    if (active > 0) throw new BadRequestException('Please complete or cancel your active jobs before deleting your account');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED', name: 'Deleted user', email: `deleted+${userId}@unret.invalid`, phone: null,
          addressText: null, city: null, avatarKey: null, mfaSecret: null, mfaEnabled: false, passwordHash: '!',
        },
      });
      await tx.refreshToken.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
      await tx.pushDevice.deleteMany({ where: { userId } });
      await tx.serviceRequest.updateMany({ where: { customerId: userId, status: { in: ['DRAFT', 'PUBLISHED', 'OFFERS_RECEIVED'] } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await tx.professionalProfile.updateMany({
        where: { userId },
        data: { visibility: 'HIDDEN', acceptingRequests: false, biography: null, businessName: 'Deleted professional', baseLat: null, baseLng: null },
      });
      await this.audit.log({ actorId: userId, action: 'user.delete', entityType: 'User', entityId: userId }, tx);
    });
    return { ok: true };
  }

  async saved(userId: string) {
    const rows = await this.prisma.savedProfessional.findMany({
      where: { userId },
      include: { professional: { include: { user: { select: { name: true, avatarKey: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      professionalId: r.professionalId,
      name: r.professional.businessName ?? r.professional.user.name,
      headline: r.professional.headline,
      city: r.professional.city,
      ratingAvg: r.professional.ratingAvg,
      ratingCount: r.professional.ratingCount,
      avatarUrl: this.storage.signedUrl(r.professional.user.avatarKey),
    }));
  }

  async save(userId: string, professionalId: string) {
    await this.prisma.savedProfessional.upsert({
      where: { userId_professionalId: { userId, professionalId } },
      create: { userId, professionalId },
      update: {},
    });
    return { ok: true };
  }

  async unsave(userId: string, professionalId: string) {
    await this.prisma.savedProfessional.deleteMany({ where: { userId, professionalId } });
    return { ok: true };
  }
}
