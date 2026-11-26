import { ADMIN_ROLE_PERMISSIONS } from '@unret/shared';
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { EmailChannel } from '../notifications/channels';
import { createHash, randomBytes } from 'crypto';
import { authenticator } from 'otplib';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
// Pre-computed hash used to equalize timing when the user does not exist.
const DUMMY_HASH = bcrypt.hashSync('unret-timing-equalizer', 12);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
    private email: EmailChannel,
  ) {}

  async register(dto: RegisterDto, ip?: string) {
    const country = await this.prisma.country.findFirst({ where: { code: dto.countryCode.toUpperCase(), isActive: true } });
    if (!country) throw new BadRequestException('UNRET is not yet available in this country');
    const email = dto.email?.trim().toLowerCase();
    const exists = await this.prisma.user.findFirst({
      where: { OR: [email ? { email } : undefined, dto.phone ? { phone: dto.phone } : undefined].filter(Boolean) as any },
    });
    if (exists) throw new ConflictException('An account with this email or phone already exists');

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        phone: dto.phone,
        passwordHash: await bcrypt.hash(dto.password, 12),
        countryCode: country.code,
        preferredLanguage: dto.preferredLanguage ?? country.defaultLanguage,
        termsAcceptedAt: new Date(),
      },
    });
    await this.audit.log({ actorId: user.id, action: 'auth.register', entityType: 'User', entityId: user.id, ip });
    return this.issueTokens(user.id, false);
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const id = dto.identifier.trim();
    const user = await this.prisma.user.findFirst({ where: id.includes('@') ? { email: id.toLowerCase() } : { phone: id } });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('This account is not active');

    let mfa = false;
    if (user.mfaEnabled) {
      if (!dto.mfaCode) return { mfaRequired: true };
      if (!authenticator.check(dto.mfaCode, user.mfaSecret!)) throw new UnauthorizedException('Invalid verification code');
      mfa = true;
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ actorId: user.id, action: 'auth.login', entityType: 'User', entityId: user.id, ip, metadata: { mfa } });
    return this.issueTokens(user.id, mfa, userAgent);
  }

  /** Refresh-token rotation: each refresh token is single-use; reuse revokes the whole family. */
  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('Refresh token reuse detected; please sign in again');
    }
    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Session expired');
    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    // MFA status is not carried across refresh for admins: they must re-verify after access token expiry window
    // only if MFA is enabled AND the previous session was verified (encoded in userAgent marker).
    return this.issueTokens(user.id, stored.userAgent?.startsWith('mfa:') ?? false, stored.userAgent ?? undefined);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  // ── Forgot password ──

  private webBase() {
    return (process.env.PUBLIC_WEB_URL || (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0]).trim().replace(/\/$/, '');
  }

  /** Creates a one-time link (only its hash is stored) and emails it. Used by "Forgot password?" and by administrators. */
  async sendPasswordReset(userId: string, opts: { byAdminId?: string; hours?: number } = {}) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, status: true, preferredLanguage: true } });
    if (!user?.email || user.status !== 'ACTIVE') return { sent: false };
    const token = randomBytes(32).toString('base64url');
    const hours = opts.hours ?? 1;
    await this.prisma.passwordResetToken.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + hours * 3600e3), createdById: opts.byAdminId ?? null } });
    const ro = user.preferredLanguage === 'ro';
    await this.email.send({
      to: user.email, locale: user.preferredLanguage,
      subject: ro ? 'Setează o parolă nouă pentru UNRET' : 'Set a new UNRET password',
      body: ro
        ? `Salut ${user.name},\n\nAm primit o cerere de resetare a parolei${opts.byAdminId ? ' de la echipa UNRET' : ''}. Linkul este valabil ${hours === 1 ? 'o oră' : `${hours} ore`} și poate fi folosit o singură dată. Dacă nu ai cerut tu, ignoră acest email.`
        : `Hi ${user.name},\n\nWe received a request to reset your password${opts.byAdminId ? ' from the UNRET team' : ''}. The link works for ${hours === 1 ? 'one hour' : `${hours} hours`} and can be used once. If you did not ask for this, you can ignore this email.`,
      actionUrl: `${this.webBase()}/reset-password?token=${token}`,
    }).catch(() => undefined);
    await this.audit.log({ actorId: opts.byAdminId ?? userId, action: opts.byAdminId ? 'admin.user.password_reset_link' : 'auth.password.forgot', entityType: 'User', entityId: userId });
    return { sent: true, to: user.email };
  }

  /** Always answers the same way, so nobody can find out which emails have an account. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: 'insensitive' } }, select: { id: true } });
    if (user) {
      const recent = await this.prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 15 * 60e3) } } });
      if (recent < 3) await this.sendPasswordReset(user.id);
    }
    return { ok: true };
  }

  async resetPassword(token: string, password: string) {
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw new BadRequestException('This link is no longer valid. Ask for a new one.');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await bcrypt.hash(password, 12) } }),
      this.prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      // Sign out everywhere: whoever had the old password loses access.
      this.prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: row.userId, action: 'auth.password.reset', entityType: 'User', entityId: row.userId });
    return { ok: true };
  }

  async me(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, phone: true, role: true, adminRole: true, countryCode: true, preferredLanguage: true,
        avatarKey: true, city: true, addressText: true, mfaEnabled: true, createdAt: true,
        country: { select: { currency: true, defaultTimezone: true } },
        professional: { select: { id: true, visibility: true, businessName: true, accountType: true, companyId: true } },
      },
    });
    // Administrators: their role and what it allows (the website shows only the admin pages they can use).
    const adminRole = u.role === 'ADMIN' ? u.adminRole ?? 'OWNER' : null;
    return { ...u, adminRole, adminPermissions: adminRole ? ADMIN_ROLE_PERMISSIONS[adminRole] : [] };
  }

  async mfaSetup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) throw new BadRequestException('MFA already enabled');
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });
    return { secret, otpauthUrl: authenticator.keyuri(user.email ?? user.phone ?? user.id, 'UNRET', secret) };
  }

  async mfaEnable(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecret || !authenticator.check(code, user.mfaSecret)) throw new BadRequestException('Invalid code');
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    await this.audit.log({ actorId: userId, action: 'auth.mfa.enable', entityType: 'User', entityId: userId });
    return { ok: true };
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new BadRequestException('Current password is incorrect');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next, 12) } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: userId, action: 'auth.password.change', entityType: 'User', entityId: userId });
    return { ok: true };
  }

  private async issueTokens(userId: string, mfa: boolean, userAgent?: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, mfa },
      { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m' },
    );
    const refreshToken = randomBytes(48).toString('base64url');
    const days = Number(this.config.get('JWT_REFRESH_TTL_DAYS') ?? 30);
    const ua = (mfa ? 'mfa:' : '') + (userAgent?.replace(/^mfa:/, '') ?? '').slice(0, 200);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + days * 864e5), userAgent: ua },
    });
    return { accessToken, refreshToken };
  }
}
