import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { AdminPermission, hasAdminPermission } from '@unret/shared';
import { AuthUser, PERMISSIONS, IS_PUBLIC, ROLES } from './decorators';

/**
 * Global guard: verifies the bearer access token and re-checks account status
 * on every request so suspensions take effect immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Authentication required');
    }
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET') });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, adminRole: true, status: true, professional: { select: { id: true } } },
      });
      if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');
      req.user = {
        id: user.id,
        role: user.role,
        adminRole: user.role === 'ADMIN' ? user.adminRole ?? 'OWNER' : null,
        mfa: !!payload.mfa,
        professionalId: user.professional?.id ?? null,
      } satisfies AuthUser;
      return true;
    } catch (e) {
      if (isPublic) return true;
      throw e instanceof UnauthorizedException ? e : new UnauthorizedException('Invalid or expired token');
    }
  }
}

/** Role-based access control. Admin routes additionally require an MFA-verified session. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, private config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const perms = this.reflector.getAllAndOverride<AdminPermission[]>(PERMISSIONS, [ctx.getHandler(), ctx.getClass()]);
    let roles = this.reflector.getAllAndOverride<string[]>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (perms?.length) roles = ['ADMIN'];
    if (!roles?.length) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (perms?.length && user?.role === 'ADMIN' && !perms.some((p) => hasAdminPermission(user.adminRole, p))) {
      throw new ForbiddenException('Your administrator role does not allow this action');
    }
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Insufficient permissions');
    if (user.role === 'ADMIN' && roles.includes('ADMIN') && this.config.get('ADMIN_MFA_REQUIRED') === 'true' && !user.mfa) {
      throw new ForbiddenException('Multi-factor authentication required for administrative actions');
    }
    return true;
  }
}

/** Throws unless the current user has a professional profile; returns its id. */
export function requirePro(user: AuthUser): string {
  if (!user.professionalId) throw new ForbiddenException('A professional profile is required for this action');
  return user.professionalId;
}
