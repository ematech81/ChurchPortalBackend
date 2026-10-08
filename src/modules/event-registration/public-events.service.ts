import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventForm } from './event-form.entity';
import { EventRegistration } from './event-registration.entity';
import { PublicRegisterDto } from './dto/event-form.dto';
import { newTicketCode, validateAnswers } from './form-validation';
import { eventStatus } from './event-forms.service';
import { Church } from '../churches/church.entity';
import { phoneDigitVariants, toE164, toInternationalDigits } from '../../common/utils/phone';

/**
 * The anonymous side: anyone with the link can read the form and register.
 * Nothing here ever returns other people's registrations.
 */
@Injectable()
export class PublicEventsService {
  constructor(
    @InjectRepository(EventForm) private readonly events: Repository<EventForm>,
    @InjectRepository(EventRegistration) private readonly regs: Repository<EventRegistration>,
    @InjectRepository(Church) private readonly churches: Repository<Church>,
  ) {}

  async getForm(slug: string) {
    const ev = await this.events.findOne({ where: { slug } });
    if (!ev) throw new NotFoundException('This event link is not valid.');
    const count = await this.regs.count({ where: { eventId: ev.id } });
    const church = await this.churches.findOne({ where: { id: ev.churchId }, select: ['id', 'name', 'logoUrl'] });

    return {
      slug: ev.slug,
      title: ev.title,
      description: ev.description,
      startsAt: ev.startsAt,
      venue: ev.venue,
      registrationClosesAt: ev.registrationClosesAt,
      churchName: church?.name ?? null,
      fields: ev.fields.map((f) => ({
        id: f.id, type: f.type, label: f.label, required: f.required, options: f.options, helpText: f.helpText,
      })),
      status: eventStatus(ev, count),
      spotsLeft: ev.capacity !== null ? Math.max(ev.capacity - count, 0) : null,
    };
  }

  async register(slug: string, dto: PublicRegisterDto) {
    // Honeypot: real people never see this field. Pretend it worked so bots learn nothing.
    if (dto.website && dto.website.trim()) {
      return { ok: true, ticketCode: 'XXXXXX', message: 'Thank you! You are registered.' };
    }

    if (!phoneDigitVariants(dto.phone).length) {
      throw new BadRequestException({ message: ['Please enter a valid phone number.'], code: 'INVALID_ANSWERS' });
    }
    const fullName = dto.fullName.trim().replace(/\s+/g, ' ');
    if (fullName.length < 2) {
      throw new BadRequestException({ message: ['Please enter your full name.'], code: 'INVALID_ANSWERS' });
    }

    return this.events.manager.transaction(async (tx) => {
      // Lock the event row: capacity and one-per-phone are checked and written as one step, so a
      // rush of people hitting the link together cannot overshoot the limit.
      const ev = await tx.createQueryBuilder(EventForm, 'e').setLock('pessimistic_write').where('e.slug = :slug', { slug }).getOne();
      if (!ev) throw new NotFoundException('This event link is not valid.');

      const count = await tx.count(EventRegistration, { where: { eventId: ev.id } });
      const status = eventStatus(ev, count);
      if (status === 'closed') throw new ForbiddenException({ message: 'Registration for this event is closed.', code: 'REGISTRATION_CLOSED' });
      if (status === 'full') throw new ConflictException({ message: 'Sorry, this event is full.', code: 'EVENT_FULL' });

      const answers = validateAnswers(ev.fields, dto.answers ?? {});
      const phoneKey = toInternationalDigits(dto.phone);

      if (ev.uniquePhone) {
        const exists = await tx.exists(EventRegistration, { where: { eventId: ev.id, dedupeKey: phoneKey } });
        if (exists) {
          // Deliberately does not reveal the earlier ticket code (anyone could type someone else's number).
          throw new ConflictException({
            message: 'This phone number is already registered for this event.',
            code: 'ALREADY_REGISTERED',
          });
        }
      }

      let ticketCode = newTicketCode();
      for (let i = 0; i < 10 && (await tx.exists(EventRegistration, { where: { eventId: ev.id, ticketCode } })); i++) {
        ticketCode = newTicketCode();
      }

      await tx.save(
        tx.create(EventRegistration, {
          eventId: ev.id,
          churchId: ev.churchId,
          fullName: fullName.slice(0, 120),
          phone: toE164(dto.phone),
          dedupeKey: ev.uniquePhone ? phoneKey : null,
          ticketCode,
          answers,
        }),
      );

      return {
        ok: true,
        ticketCode,
        message: ev.confirmationMessage || 'Thank you! You are registered.',
      };
    });
  }
}
