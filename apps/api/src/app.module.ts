import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { SupportModule } from './modules/support/support.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './common/audit.service';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { PrismaModule } from './common/prisma.service';
import { HealthController } from './health.controller';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { CountriesModule } from './modules/countries/countries.module';
import { FilesModule } from './modules/files/files.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { MatchingModule } from './modules/matching/matching.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OffersModule } from './modules/offers/offers.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProfessionalsModule } from './modules/professionals/professionals.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RequestsModule } from './modules/requests/requests.module';
import { ReviewsModule } from './modules/reviews/reviews.controller';
import { SchedulerModule } from './modules/scheduler/scheduler.service';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { UsersModule } from './modules/users/users.module';
import { VerificationsModule } from './modules/verifications/verifications.module';

/**
 * Modular monolith (PRD §16). Each business module owns its controllers and services and
 * talks to others through exported services, so modules can be extracted later if needed.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    // Platform
    FilesModule,
    RealtimeModule,
    NotificationsModule,
    // Identity & users
    AuthModule,
    UsersModule,
    CountriesModule,
    CompaniesModule,
    // Marketplace & jobs
    CategoriesModule,
    AvailabilityModule,
    ProfessionalsModule,
    MatchingModule,
    RequestsModule,
    OffersModule,
    JobsModule,
    PaymentsModule,
    ReviewsModule,
    SubscriptionsModule,
    // Communication
    ConversationsModule,
    // Trust & safety, administration
    VerificationsModule,
    ReportsModule,
    AdminModule,
    SchedulerModule,
    SupportModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
