import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import { EventForm, FormField } from './event-form.entity';
import { EventRegistration } from './event-registration.entity';
import { CreateEventFormDto, UpdateEventFormDto } from './dto/event-form.dto';
import { answerToText, normalizeFields } from './form-validation';
import { Church } from '../churches/church.entity';
import { MembersService, Scope } from '../members/members.service';
import { ExportLogService } from '../exports/export-log.service';
import { ExportFile, MIME, buildCsv, buildXlsx, safeFilename, toExportFile } from '../../common/utils/export-file';

const ids = (scope: Scope) => (Array.isArray(scope) ? scope : [scope]);
const WAT_OFFSET_MS = 60 * 60 * 1000; // Nigeria is UTC+1 year-round
const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => '\\' + c);
const MAX_EXPORT_ROWS = 50_000;

export type EventStatus = 'open' | 'closed' | 'full' | 'scheduled';

/** Registration state shown to admins and to the public page. */
export function eventStatus(ev: EventForm, registrationCount: number, now = new Date()): EventStatus {
  if (!ev.isOpen) return 'closed';
  if (ev.registrationClosesAt && ev.registrationClosesAt <= now) return 'closed';
  if (ev.capacity !== null && registrationCount >= ev.capacity) return 'full';
  return 'open';
}

@Injectable()
export class EventFormsService {
  constructor(
    @InjectRepository(EventForm) private readonly events: Repository<EventForm>,
    @InjectRepository(EventRegistration) private readonly regs: Repository<EventRegistration>,
    @InjectRepository(Church) private readonly churches: Repository<Church>,
    private readonly membersService: MembersService,
    private readonly exportLog: ExportLogService,
    private readonly config: ConfigService,
  ) {}

  /** The shareable link. Null until PUBLIC_WEB_URL is configured for the deployment. */
  shareUrl(slug: string): string | null {
    const base = this.config.get<string>('app.publicWebUrl');
    return base ? `${base}/e/${slug}` : null;
  }

  private view(ev: EventForm, count: number, churchName?: string) {
    return {
      id: ev.id,
      slug: ev.slug,
      title: ev.title,
      description: ev.description,
      startsAt: ev.startsAt,
      venue: ev.venue,
      registrationClosesAt: ev.registrationClosesAt,
      capacity: ev.capacity,
      isOpen: ev.isOpen,
      uniquePhone: ev.uniquePhone,
      confirmationMessage: ev.confirmationMessage,
      fields: ev.fields,
      churchId: ev.churchId,
      churchName: churchName ?? null,
      createdAt: ev.createdAt,
      registrationCount: count,
      status: eventStatus(ev, count),
      shareUrl: this.shareUrl(ev.slug),
    };
  }

  private async findInScope(id: string, scope: Scope): Promise<EventForm> {
    const ev = await this.events.findOne({ where: { id, churchId: In(ids(scope)) } });
    if (!ev) throw new NotFoundException('Event not found');
    return ev;
  }

  private async slugFor(title: string): Promise<string> {
    const stem =
      title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'event';
    for (let i = 0; i < 8; i++) {
      let r = '';
      for (let j = 0; j < 5; j++) r += 'abcdefghjkmnpqrstuvwxyz23456789'[randomInt(31)];
      const slug = `${stem}-${r}`;
      if (!(await this.events.exist({ where: { slug }, withDeleted: true }))) return slug;
    }
    throw new BadRequestException('Could not create a link. Please try again.');
  }

  // ── events ─────────────────────────────────────────────────────────────────

  async create(churchId: string, userId: string, dto: CreateEventFormDto) {
    const ev = await this.events.save(
      this.events.create({
        churchId,
        createdById: userId,
        slug: await this.slugFor(dto.title),
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        venue: dto.venue?.trim() || null,
        registrationClosesAt: dto.registrationClosesAt ? new Date(dto.registrationClosesAt) : null,
        capacity: dto.capacity ?? null,
        uniquePhone: dto.uniquePhone ?? true,
        confirmationMessage: dto.confirmationMessage?.trim() || null,
        fields: normalizeFields(dto.fields),
      }),
    );
    return this.view(ev, 0);
  }

  async list(scope: Scope, search?: string, limit?: number) {
    const take = Math.min(Number.isFinite(limit) && limit! > 0 ? limit! : 30, 100);
    const qb = this.events
      .createQueryBuilder('e')
      .where('e.churchId IN (:...scopeIds)', { scopeIds: ids(scope) })
      .orderBy('e.createdAt', 'DESC')
      .take(take);
    if (search?.trim()) qb.andWhere('e.title ILIKE :s', { s: `%${escapeLike(search.trim())}%` });
    const events = await qb.getMany();
    if (!events.length) return [];

    const counts = await this.regs
      .createQueryBuilder('r')
      .select('r.eventId', 'eventId')
      .addSelect('COUNT(r.id)', 'n')
      .where('r.eventId IN (:...evIds)', { evIds: events.map((e) => e.id) })
      .groupBy('r.eventId')
      .getRawMany();
    const countMap = new Map(counts.map((c) => [c.eventId, parseInt(c.n, 10)]));

    const names = new Map(
      (await this.churches.find({ where: { id: In([...new Set(events.map((e) => e.churchId))]) }, select: ['id', 'name'] })).map(
        (c) => [c.id, c.name],
      ),
    );
    return events.map((e) => this.view(e, countMap.get(e.id) ?? 0, names.get(e.churchId)));
  }

  async get(id: string, scope: Scope) {
    const ev = await this.findInScope(id, scope);
    const count = await this.regs.count({ where: { eventId: ev.id } });
    const church = await this.churches.findOne({ where: { id: ev.churchId }, select: ['id', 'name'] });
    return this.view(ev, count, church?.name);
  }

  async update(id: string, scope: Scope, dto: UpdateEventFormDto) {
    const ev = await this.findInScope(id, scope);
    const count = await this.regs.count({ where: { eventId: ev.id } });

    if (dto.fields) {
      const next = normalizeFields(dto.fields);
      if (count > 0) {
        // People have already answered: their answers hang off the question ids.
        const byId = new Map(next.map((f) => [f.id, f]));
        for (const old of ev.fields) {
          const kept = byId.get(old.id);
          if (!kept || kept.type !== old.type) {
            throw new BadRequestException(
              `"${old.label}" already has answers, so it cannot be removed or changed to another type. You can rename it, change its options, or add new questions.`,
            );
          }
        }
      }
      ev.fields = next;
    }
    if (dto.title !== undefined) ev.title = dto.title.trim();
    if (dto.description !== undefined) ev.description = dto.description?.trim() || null;
    if (dto.startsAt !== undefined) ev.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.venue !== undefined) ev.venue = dto.venue?.trim() || null;
    if (dto.registrationClosesAt !== undefined) ev.registrationClosesAt = dto.registrationClosesAt ? new Date(dto.registrationClosesAt) : null;
    if (dto.capacity !== undefined) ev.capacity = dto.capacity ?? null;
    if (dto.uniquePhone !== undefined) ev.uniquePhone = dto.uniquePhone;
    if (dto.confirmationMessage !== undefined) ev.confirmationMessage = dto.confirmationMessage?.trim() || null;
    if (dto.isOpen !== undefined) ev.isOpen = dto.isOpen;

    const saved = await this.events.save(ev);
    return this.view(saved, count);
  }

  /** Stops the link working. Registrations are kept (soft delete) in case it was a mistake. */
  async remove(id: string, scope: Scope) {
    const ev = await this.findInScope(id, scope);
    await this.events.softRemove(ev);
  }

  // ── responses ──────────────────────────────────────────────────────────────

  async registrations(id: string, scope: Scope, search?: string, page = 1, limit = 50) {
    const ev = await this.findInScope(id, scope);
    const take = Math.min(Math.max(limit || 50, 1), 200);
    const p = Math.max(page || 1, 1);

    const qb = this.regs
      .createQueryBuilder('r')
      .where('r.eventId = :eid', { eid: ev.id })
      .orderBy('r.createdAt', 'DESC')
      .skip((p - 1) * take)
      .take(take);
    if (search?.trim()) {
      qb.andWhere('(r.fullName ILIKE :s OR r.phone ILIKE :s OR r.ticketCode ILIKE :s)', { s: `%${escapeLike(search.trim())}%` });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: p, limit: take };
  }

  async deleteRegistration(id: string, regId: string, scope: Scope) {
    const ev = await this.findInScope(id, scope);
    // Hard delete: the phone number must be free to register again.
    const res = await this.regs.delete({ id: regId, eventId: ev.id });
    if (!res.affected) throw new NotFoundException('Registration not found');
  }

  // ── export ─────────────────────────────────────────────────────────────────

  async export(id: string, scope: Scope, callerChurchId: string, userId: string, format: 'xlsx' | 'csv'): Promise<ExportFile & { count: number }> {
    const ev = await this.findInScope(id, scope);
    const rows = await this.regs.find({ where: { eventId: ev.id }, order: { createdAt: 'ASC' }, take: MAX_EXPORT_ROWS + 1 });
    if (rows.length > MAX_EXPORT_ROWS) throw new BadRequestException('Too many registrations to export at once.');

    // Two questions can share a label; keep the headers distinguishable.
    const used = new Map<string, number>();
    const fieldHeaders = ev.fields.map((f: FormField) => {
      const n = (used.get(f.label) ?? 0) + 1;
      used.set(f.label, n);
      return n > 1 ? `${f.label} (${n})` : f.label;
    });

    const headers = ['#', 'Registered (WAT)', 'Full name', 'Phone', 'Ticket code', ...fieldHeaders];
    const table = rows.map((r, i) => [
      i + 1,
      new Date(r.createdAt.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' '),
      r.fullName,
      r.phone,
      r.ticketCode,
      ...ev.fields.map((f) => answerToText(f, r.answers?.[f.id])),
    ]);

    const stem = `${ev.title}-registrations`;
    const file =
      format === 'csv'
        ? toExportFile(safeFilename(stem, 'csv'), MIME.csv, buildCsv(headers, table, [3, 4])) // phone + ticket are ours
        : toExportFile(safeFilename(stem, 'xlsx'), MIME.xlsx, await buildXlsx('Registrations', headers, table));

    await this.exportLog.record({
      churchId: callerChurchId,
      userId,
      kind: 'event_registrations',
      format,
      rowCount: rows.length,
      details: { eventId: ev.id, title: ev.title },
    });
    return { ...file, count: rows.length };
  }
}
