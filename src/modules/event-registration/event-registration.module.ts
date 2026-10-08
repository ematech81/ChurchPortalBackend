import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventForm } from './event-form.entity';
import { EventRegistration } from './event-registration.entity';
import { Church } from '../churches/church.entity';
import { EventFormsService } from './event-forms.service';
import { PublicEventsService } from './public-events.service';
import { EventFormsController } from './event-forms.controller';
import { PublicEventsController } from './public-events.controller';
import { MembersModule } from '../members/members.module';
import { ExportsModule } from '../exports/exports.module';

@Module({
  imports: [TypeOrmModule.forFeature([EventForm, EventRegistration, Church]), MembersModule, ExportsModule],
  controllers: [EventFormsController, PublicEventsController],
  providers: [EventFormsService, PublicEventsService],
})
export class EventRegistrationModule {}
