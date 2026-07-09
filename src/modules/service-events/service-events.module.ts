import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceEvent } from './service-event.entity';
import { ServiceEventsService } from './service-events.service';
import { ServiceEventsController } from './service-events.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceEvent])],
  providers: [ServiceEventsService],
  controllers: [ServiceEventsController],
  exports: [ServiceEventsService],
})
export class ServiceEventsModule {}
