import { Global, Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { AvailabilityAlertsService } from './alerts.service';
import { AvailabilityService } from './availability.service';

@Global()
@Module({ controllers: [AvailabilityController], providers: [AvailabilityService, AvailabilityAlertsService], exports: [AvailabilityService, AvailabilityAlertsService] })
export class AvailabilityModule {}
