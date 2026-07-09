import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { MessageLog } from './message-log.entity';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { TermiiProvider } from './providers/termii.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([MessageLog]),
    BullModule.registerQueue({ name: 'messaging' }),
  ],
  controllers: [MessagingController],
  providers: [MessagingService, TermiiProvider],
  exports: [MessagingService],
})
export class MessagingModule {}
