import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { MessageLog } from './message-log.entity';
import { Member } from '../members/member.entity';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { BulkSmsProvider } from './providers/bulksms.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([MessageLog, Member]),
    BullModule.registerQueue({ name: 'messaging' }),
  ],
  controllers: [MessagingController],
  providers: [MessagingService, BulkSmsProvider],
  exports: [MessagingService, BulkSmsProvider],
})
export class MessagingModule {}
