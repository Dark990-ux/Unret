import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
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

  async me(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, phone: true, role: true, countryCode: true, preferredLanguage: true,
        avatarKey: true, city: true, addressText: true, mfaEnabled: true, createdAt: true,
        country: { select: { currency: true, defaultTimezone: true } },
        professional: { select: { id: true, visibility: true, businessName: true, accountType: true, companyId: true } },
      },
    });
    return u;
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
