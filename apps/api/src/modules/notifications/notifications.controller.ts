import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsString, ValidateNested } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { EmailChannel } from './channels';
import { ESSENTIAL_NOTIFICATIONS, NotificationType } from '@unret/shared';
import { AuthUser, CurrentUser, Public } from '../../common/decorators';
import { PageQuery, pageResult, paginate } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';

class PrefItem {
  @IsIn(Object.values(NotificationType)) type: string;
  @IsBoolean() inApp: boolean;
  @IsBoolean() email: boolean;
  @IsBoolean() push: boolean;
  @IsBoolean() sms: boolean;
}
class PrefsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PrefItem) items: PrefItem[];
}
class EmailSettingsDto {
  @IsBoolean() enabled: boolean;
}
class DeviceDto {
  @IsString() token: string;
  @IsIn(['ios', 'android', 'web']) platform: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private emailChannel: EmailChannel) {}

  // ── Email notifications on/off ──

  @Get('email')
  async emailSettings(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, emailNotifications: true } });
    return { enabled: u.emailNotifications, email: u.email, serviceConnected: this.emailChannel.configured };
  }

  @Put('email')
  async setEmailSettings(@CurrentUser() user: AuthUser, @Body() dto: EmailSettingsDto) {
    await this.prisma.user.update({ where: { id: user.id }, data: { emailNotifications: dto.enabled } });
    return this.emailSettings(user);
  }

  @Post('email/test')
  testEmail(@CurrentUser() user: AuthUser) {
    return this.notifications.sendTestEmail(user.id);
  }

  /** The link in every email: turns notification emails off without signing in (also RFC 8058 one-click). */
  @Public()
  @Post('unsubscribe')
  async unsubscribe(@Query('token') qToken?: string, @Body('token') bToken?: string) {
    const userId = this.notifications.verifyUnsubscribeToken(qToken ?? bToken ?? '');
    if (!userId) return { ok: false };
    const u = await this.prisma.user.update({ where: { id: userId }, data: { emailNotifications: false }, select: { email: true } }).catch(() => null);
    if (!u) return { ok: false };
    const [name, domain] = (u.email ?? '').split('@');
    return { ok: true, email: name ? `${name.slice(0, 2)}•••@${domain}` : null };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() q: PageQuery) {
    const where = { userId: user.id };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q) }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { ...pageResult(items, total, q), unread };
  }

  @Patch(':id/read')
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Get('preferences')
  async prefs(@CurrentUser() user: AuthUser) {
    const stored = await this.prisma.notificationPreference.findMany({ where: { userId: user.id } });
    return Object.values(NotificationType).map((type) => {
      const p = stored.find((s) => s.type === type);
      return {
        type,
        essential: ESSENTIAL_NOTIFICATIONS.includes(type),
        inApp: p?.inApp ?? true,
        email: p?.email ?? true,
        push: p?.push ?? true,
        sms: p?.sms ?? false,
      };
    });
  }

  @Put('preferences')
  async setPrefs(@CurrentUser() user: AuthUser, @Body() dto: PrefsDto) {
    await this.prisma.$transaction(
      dto.items.map((i) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_type: { userId: user.id, type: i.type } },
          create: { userId: user.id, type: i.type, inApp: i.inApp, email: i.email, push: i.push, sms: i.sms },
          update: { inApp: i.inApp, email: i.email, push: i.push, sms: i.sms },
        }),
      ),
    );
    return this.prefs(user);
  }

  @Post('devices')
  async registerDevice(@CurrentUser() user: AuthUser, @Body() dto: DeviceDto) {
    await this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      create: { userId: user.id, token: dto.token, platform: dto.platform },
      update: { userId: user.id, platform: dto.platform },
    });
    return { ok: true };
  }

  @Delete('devices/:token')
  async removeDevice(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    await this.prisma.pushDevice.deleteMany({ where: { token, userId: user.id } });
    return { ok: true };
  }
}
