import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../files/storage.service';

class UpdateCompanyDto {
  @IsOptional() @IsString() @Length(2, 160) displayName?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() logoKey?: string;
}
class AddMemberDto {
  @IsEmail() email: string;
  @IsIn(['MANAGER', 'MEMBER']) role: 'MANAGER' | 'MEMBER';
}

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService, private storage: StorageService, private audit: AuditService) {}

  private async membership(userId: string) {
    const m = await this.prisma.companyMember.findFirst({ where: { userId }, include: { company: true } });
    if (!m) throw new NotFoundException('You are not part of a company');
    return m;
  }
  private async manager(userId: string) {
    const m = await this.membership(userId);
    if (m.role === 'MEMBER') throw new ForbiddenException('Only owners and managers can do this');
    return m;
  }

  async mine(user: AuthUser) {
    const m = await this.membership(user.id);
    const c = await this.prisma.company.findUniqueOrThrow({
      where: { id: m.companyId },
      include: { members: { include: { user: { select: { id: true, name: true, email: true, professional: { select: { id: true } } } } }, orderBy: { createdAt: 'asc' } } },
    });
    return { ...c, myRole: m.role, logoUrl: this.storage.signedUrl(c.logoKey) };
  }

  async update(user: AuthUser, dto: UpdateCompanyDto) {
    const m = await this.manager(user.id);
    if (dto.logoKey) this.storage.assertOwned(dto.logoKey, user.id, 'logo');
    await this.prisma.company.update({ where: { id: m.companyId }, data: dto });
    return this.mine(user);
  }

  async addMember(user: AuthUser, dto: AddMemberDto) {
    const m = await this.manager(user.id);
    const target = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!target || target.status !== 'ACTIVE') throw new BadRequestException('No active UNRET account with this email. Ask them to register first.');
    if (await this.prisma.companyMember.findFirst({ where: { userId: target.id } })) throw new BadRequestException('This user already belongs to a company');
    await this.prisma.companyMember.create({ data: { companyId: m.companyId, userId: target.id, role: dto.role } });
    await this.prisma.professionalProfile.updateMany({ where: { userId: target.id }, data: { companyId: m.companyId } });
    await this.audit.log({ actorId: user.id, action: 'company.member.add', entityType: 'Company', entityId: m.companyId, metadata: { userId: target.id, role: dto.role } });
    return this.mine(user);
  }

  async removeMember(user: AuthUser, memberUserId: string) {
    const m = await this.manager(user.id);
    const target = await this.prisma.companyMember.findUnique({ where: { companyId_userId: { companyId: m.companyId, userId: memberUserId } } });
    if (!target) throw new NotFoundException();
    if (target.role === 'OWNER') throw new BadRequestException('The owner cannot be removed');
    await this.prisma.companyMember.delete({ where: { id: target.id } });
    await this.prisma.professionalProfile.updateMany({ where: { userId: memberUserId, companyId: m.companyId }, data: { companyId: null } });
    await this.prisma.job.updateMany({ where: { companyId: m.companyId, assignedMemberUserId: memberUserId, status: { in: ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS'] } }, data: { assignedMemberUserId: null } });
    await this.audit.log({ actorId: user.id, action: 'company.member.remove', entityType: 'Company', entityId: m.companyId, metadata: { userId: memberUserId } });
    return this.mine(user);
  }

  /** Company performance statistics. */
  async stats(user: AuthUser) {
    const m = await this.manager(user.id);
    const where = { companyId: m.companyId };
    const [byStatus, revenue, ratings, perMember] = await Promise.all([
      this.prisma.job.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.job.groupBy({ by: ['currency'], where: { ...where, status: 'COMPLETED' }, _sum: { agreedPriceMinor: true } }),
      this.prisma.review.aggregate({ where: { job: where, status: 'PUBLISHED' }, _avg: { overall: true }, _count: true }),
      this.prisma.job.groupBy({ by: ['assignedMemberUserId', 'status'], where, _count: true }),
    ]);
    return { jobsByStatus: byStatus, completedRevenue: revenue, rating: { avg: ratings._avg.overall, count: ratings._count }, perMember };
  }
}

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private companies: CompaniesService) {}

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.companies.mine(user);
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(user, dto);
  }

  @Post('me/members')
  add(@CurrentUser() user: AuthUser, @Body() dto: AddMemberDto) {
    return this.companies.addMember(user, dto);
  }

  @Delete('me/members/:userId')
  remove(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.companies.removeMember(user, userId);
  }

  @Get('me/stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.companies.stats(user);
  }
}

@Module({ controllers: [CompaniesController], providers: [CompaniesService] })
export class CompaniesModule {}
