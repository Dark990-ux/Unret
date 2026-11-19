import { Global, Module } from '@nestjs/common';
import { EmailChannel, PushChannel, SmsChannel } from './channels';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { QueueService } from './queue.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, QueueService, EmailChannel, PushChannel, SmsChannel],
  exports: [NotificationsService, QueueService],
})
export class NotificationsModule {}
