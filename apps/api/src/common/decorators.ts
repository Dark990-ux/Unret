import type { AdminPermission } from '@unret/shared';
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export interface AuthUser {
  id: string;
  role: 'USER' | 'ADMIN';
  /** Set for administrators: decides their permissions (ADMIN_ROLE_PERMISSIONS). */
  adminRole?: 'OWNER' | 'SUPPORT' | 'MODERATOR' | 'FINANCE' | null;
  mfa: boolean;
  professionalId?: string | null;
}

export const IS_PUBLIC = 'isPublic';
/** Route does not require authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
export const Roles = (...roles: Array<'USER' | 'ADMIN'>) => SetMetadata(ROLES, roles);

export const PERMISSIONS = 'adminPermissions';
/** Administrator-only route that also needs these permissions (any of them). */
export const Permission = (...perms: AdminPermission[]) => SetMetadata(PERMISSIONS, perms);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  const req = ctx.switchToHttp().getRequest();
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
});
