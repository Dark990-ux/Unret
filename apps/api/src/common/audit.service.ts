import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;

/** Records important state changes and all sensitive administrative actions (PRD §14, §21). */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(
    entry: { actorId?: string | null; action: string; entityType: string; entityId?: string | null; metadata?: object; ip?: string },
    tx: Tx = this.prisma,
  ) {
    return tx.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        ip: entry.ip,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
