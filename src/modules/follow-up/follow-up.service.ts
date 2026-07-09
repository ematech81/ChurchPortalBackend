import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository, MoreThanOrEqual } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { FollowUpJourney, JourneyStatus } from './follow-up-journey.entity';
import { FollowUpTask, TaskStatus } from './follow-up-task.entity';
import { WorkerCodeDispatchLog } from './worker-code-dispatch-log.entity';
import { Member } from '../members/member.entity';
import { User } from '../users/user.entity';
import { Visit, VisitStatus } from '../visits/visit.entity';
import { MemberStatus, UserRole } from '@/types';
import { UsersService } from '../users/users.service';
import dayjs from 'dayjs';

const DEFAULT_JOURNEY_STEPS = [
  { dayOffset: 0,  type: 'send_message',  label: 'Welcome message to convert' },
  { dayOffset: 0,  type: 'notify_worker', label: 'Assign worker notification' },
  { dayOffset: 1,  type: 'worker_action', label: 'Day-1 call reminder' },
  { dayOffset: 3,  type: 'worker_action', label: 'Day-3 visit reminder' },
  { dayOffset: 7,  type: 'send_message',  label: 'Week-1 pastor welcome' },
  { dayOffset: 14, type: 'send_message',  label: 'Foundation class invite' },
  { dayOffset: 21, type: 'send_message',  label: 'Cell group invite' },
  { dayOffset: 28, type: 'check_status',  label: 'Mid-journey check-in' },
  { dayOffset: 42, type: 'check_status',  label: 'Journey graduation review' },
];

// ── Message template builder ──────────────────────────────────────────────────
// All templates stay in one place — swap content or add languages here later.

function buildTemplates(
  workerFirstName: string,
  workerPhone: string | null,
  memberName: string,
  pastorLastName: string,
  loginCode: string | null,
) {
  const code = loginCode ?? '(code previously sent)';
  const phone = workerPhone?.replace(/\D/g, '') ?? '';

  const whatsapp =
    `Hi ${workerFirstName}! Pst. ${pastorLastName} has assigned you to follow up with ${memberName} on Kingdom Portal.\n\n` +
    `Your login code: *${code}*\n\n` +
    `Open the app and tap the "Worker" login tab. God bless!`;

  const sms =
    `Hi ${workerFirstName}, Pst. ${pastorLastName} assigned you: ${memberName}. ` +
    `Kingdom Portal code: ${code}. Open app > Worker tab.`;

  return {
    whatsapp,
    sms,
    whatsappDeepLink: phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsapp)}`
      : null,
    smsDeepLink: workerPhone
      ? `sms:${workerPhone}?body=${encodeURIComponent(sms)}`
      : null,
    telLink: workerPhone ? `tel:${workerPhone}` : null,
  };
}

@Injectable()
export class FollowUpService {
  constructor(
    @InjectRepository(FollowUpJourney)
    private readonly journeyRepo: Repository<FollowUpJourney>,
    @InjectRepository(FollowUpTask)
    private readonly taskRepo: Repository<FollowUpTask>,
    @InjectRepository(Member)
    private readonly memberRepo: Repository<Member>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Visit)
    private readonly visitRepo: Repository<Visit>,
    @InjectRepository(WorkerCodeDispatchLog)
    private readonly dispatchLogRepo: Repository<WorkerCodeDispatchLog>,
    @InjectQueue('follow-up')
    private readonly queue: Queue,
  ) {}

  // ── Ensure worker has a User account + login code ─────────────────────────
  // Returns the plaintext code ONLY when a new code was generated.
  private async _ensureWorkerCode(
    workerMember: Member,
    churchId: string,
  ): Promise<{ userId: string; loginCodePlain: string | null; isNewCode: boolean }> {
    let loginCodePlain: string | null = null;
    let isNewCode = false;

    // Search by phone (any role) first — avoids creating a duplicate user for a
    // member who already has a User account under a different role (e.g. 'member').
    let workerUser = workerMember.phone
      ? await this.userRepo.findOne({ where: { phone: workerMember.phone } })
      : null;

    // Fallback: search by email if phone lookup found nothing
    if (!workerUser && workerMember.email) {
      workerUser = await this.userRepo.findOne({ where: { email: workerMember.email } });
    }

    if (!workerUser) {
      // Truly no existing account — create one.
      // Use a guaranteed-unique email: member UUID ensures no collision.
      const randomToken = Math.random().toString(36) + Date.now().toString(36);
      const passwordHash = await bcrypt.hash(randomToken, 12);
      loginCodePlain = UsersService.generateLoginCode(workerMember.firstName);
      const codeHash = UsersService.hashLoginCode(loginCodePlain);
      isNewCode = true;

      workerUser = (await this.userRepo.save(
        this.userRepo.create({
          firstName:          workerMember.firstName,
          lastName:           workerMember.lastName,
          phone:              workerMember.phone,
          email:              workerMember.email ?? `worker-${workerMember.id}@portal.internal`,
          role:               UserRole.FOLLOW_UP_WORKER,
          churchId,
          passwordHash,
          isEmailVerified:    true,
          loginCodeHash:      codeHash,
          loginCodeUpdatedAt: new Date(),
        } as any),
      )) as unknown as User;

      console.log(`[DEV] New worker code for ${workerMember.firstName} ${workerMember.lastName}: ${loginCodePlain}`);
    } else {
      // Check if the user already has a code (loginCodeHash is hidden by default — query explicitly)
      const userWithCode = await this.userRepo
        .createQueryBuilder('u')
        .addSelect('u.loginCodeHash')
        .where('u.id = :id', { id: workerUser.id })
        .getOne();

      if (!userWithCode?.loginCodeHash) {
        loginCodePlain = UsersService.generateLoginCode(workerMember.firstName);
        const codeHash = UsersService.hashLoginCode(loginCodePlain);
        isNewCode = true;

        await this.userRepo.update(workerUser.id, {
          loginCodeHash:      codeHash,
          loginCodeUpdatedAt: new Date(),
        } as any);

        console.log(`[DEV] Generated code for existing worker ${workerMember.firstName}: ${loginCodePlain}`);
      }
    }

    return { userId: workerUser.id, loginCodePlain, isNewCode };
  }

  // ── Log a code dispatch event ─────────────────────────────────────────────
  private async _logDispatch(opts: {
    workerId: string;
    workerName: string;
    workerPhone: string | null;
    code: string | null;
    assignedBy: string | null;
    churchId: string;
    channel?: string;
  }) {
    await this.dispatchLogRepo.save(
      this.dispatchLogRepo.create({
        workerId:   opts.workerId,
        workerName: opts.workerName,
        workerPhone: opts.workerPhone,
        code:       opts.code,
        assignedBy: opts.assignedBy,
        churchId:   opts.churchId,
        channel:    opts.channel ?? 'pending_manual',
        expiresAt:  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    );
  }

  // ── startJourney ──────────────────────────────────────────────────────────

  async startJourney(
    churchId: string,
    memberId: string,
    decisionType: string,
    assignedWorkerId?: string,
    caller?: { id: string; firstName: string; lastName: string },
  ) {
    const existing = await this.journeyRepo.findOne({
      where: { churchId, memberId, status: JourneyStatus.ACTIVE },
    });
    if (existing) return { journey: existing, worker: null, messageTemplates: null };

    const journey = await this.journeyRepo.save(
      this.journeyRepo.create({ churchId, memberId, decisionType, assignedWorkerId: assignedWorkerId ?? null }),
    );

    const now = dayjs();
    const tasks = DEFAULT_JOURNEY_STEPS.map((step) =>
      this.taskRepo.create({
        churchId, journeyId: journey.id,
        type: step.type as never,
        triggerAt: now.add(step.dayOffset, 'day').toDate(),
        payload: { label: step.label },
      }),
    );
    const savedTasks = await this.taskRepo.save(tasks);
    for (const task of savedTasks) {
      try {
        const delay = Math.max(0, task.triggerAt.getTime() - Date.now());
        await this.queue.add('process-task', { taskId: task.id }, { delay });
      } catch { /* queue unavailable in dev */ }
    }

    // If a worker is assigned, generate their code and build notification templates
    if (assignedWorkerId && caller) {
      const [workerMember, targetMember] = await Promise.all([
        this.memberRepo.findOne({ where: { id: assignedWorkerId, churchId } }),
        this.memberRepo.findOne({ where: { id: memberId, churchId } }),
      ]);

      if (workerMember) {
        const { loginCodePlain, isNewCode } = await this._ensureWorkerCode(workerMember, churchId);

        await this._logDispatch({
          workerId:   assignedWorkerId,
          workerName: `${workerMember.firstName} ${workerMember.lastName}`,
          workerPhone: workerMember.phone,
          code:       loginCodePlain,
          assignedBy: caller.id,
          churchId,
        });

        const memberName = targetMember
          ? `${targetMember.firstName} ${targetMember.lastName}`
          : 'your assigned member';

        const messageTemplates = buildTemplates(
          workerMember.firstName,
          workerMember.phone,
          memberName,
          caller.lastName,
          loginCodePlain,
        );

        return {
          journey,
          worker: {
            id:                   assignedWorkerId,
            name:                 `${workerMember.firstName} ${workerMember.lastName}`,
            phone:                workerMember.phone,
            isNewCode,
            loginCode:            loginCodePlain,
            loginCodeGeneratedAt: new Date().toISOString(),
          },
          messageTemplates,
        };
      }
    }

    return { journey, worker: null, messageTemplates: null };
  }

  // ── notifyWorker — log intent + return deep-links ─────────────────────────

  async notifyWorker(
    workerId: string,
    churchId: string,
    callerId: string,
    callerLastName: string,
    channel: 'whatsapp' | 'sms' | 'call',
    journeyId?: string,
  ) {
    const workerMember = await this.memberRepo.findOne({ where: { id: workerId, churchId } });
    if (!workerMember) throw new Error('Worker not found');

    // Get the most recent dispatch log entry to retrieve the current code
    const latestLog = await this.dispatchLogRepo.findOne({
      where: { workerId, churchId },
      order: { createdAt: 'DESC' },
    });

    // Find member context
    let memberName = 'your assigned member';
    if (journeyId) {
      const journey = await this.journeyRepo.findOne({ where: { id: journeyId, churchId } });
      if (journey) {
        const m = await this.memberRepo.findOne({ where: { id: journey.memberId } });
        if (m) memberName = `${m.firstName} ${m.lastName}`;
      }
    } else {
      const journey = await this.journeyRepo.findOne({
        where: { assignedWorkerId: workerId, churchId, status: JourneyStatus.ACTIVE },
        order: { createdAt: 'DESC' },
      });
      if (journey) {
        const m = await this.memberRepo.findOne({ where: { id: journey.memberId } });
        if (m) memberName = `${m.firstName} ${m.lastName}`;
      }
    }

    const templates = buildTemplates(
      workerMember.firstName,
      workerMember.phone,
      memberName,
      callerLastName,
      latestLog?.code ?? null,
    );

    // Log the notification attempt
    await this._logDispatch({
      workerId,
      workerName: `${workerMember.firstName} ${workerMember.lastName}`,
      workerPhone: workerMember.phone,
      code: latestLog?.code ?? null,
      assignedBy: callerId,
      churchId,
      channel,
    });

    return {
      worker: {
        id: workerId,
        name: `${workerMember.firstName} ${workerMember.lastName}`,
        phone: workerMember.phone,
      },
      messageTemplates: templates,
      channel,
    };
  }

  // ── getDispatchLog (Senior Pastor view) ───────────────────────────────────

  async getDispatchLog(churchId: string) {
    const logs = await this.dispatchLogRepo.find({
      where: { churchId },
      order: { createdAt: 'DESC' },
      take: 200,
    });

    const now = new Date();
    return logs.map((l) => ({
      id: l.id,
      workerId:    l.workerId,
      workerName:  l.workerName,
      workerPhone: l.workerPhone,
      // Mask: show only first name prefix + last 2 chars of random part
      codeMasked:  l.code && l.expiresAt && l.expiresAt > now
        ? `${l.code.split('-')[0]}-${'•'.repeat(4)}${l.code.slice(-2)}`
        : null,
      codeExpired: !l.expiresAt || l.expiresAt <= now,
      assignedBy:  l.assignedBy,
      channel:     l.channel,
      createdAt:   l.createdAt,
      expiresAt:   l.expiresAt,
    }));
  }

  // ── assignWorker (PATCH /journeys/:id/assign) ─────────────────────────────

  async assignWorker(
    churchId: string,
    journeyId: string,
    workerId: string,
    caller?: { id: string; firstName: string; lastName: string },
  ) {
    await this.journeyRepo.update({ id: journeyId, churchId }, { assignedWorkerId: workerId });
    const journey = await this.journeyRepo.findOne({ where: { id: journeyId, churchId } });

    if (!caller) return { journey, worker: null, messageTemplates: null };

    const [workerMember, targetMember] = await Promise.all([
      this.memberRepo.findOne({ where: { id: workerId, churchId } }),
      journey ? this.memberRepo.findOne({ where: { id: journey.memberId } }) : null,
    ]);

    if (!workerMember) return { journey, worker: null, messageTemplates: null };

    const { loginCodePlain, isNewCode } = await this._ensureWorkerCode(workerMember, churchId);

    await this._logDispatch({
      workerId,
      workerName:  `${workerMember.firstName} ${workerMember.lastName}`,
      workerPhone: workerMember.phone,
      code:        loginCodePlain,
      assignedBy:  caller.id,
      churchId,
    });

    const memberName = targetMember
      ? `${targetMember.firstName} ${targetMember.lastName}`
      : 'your assigned member';

    const messageTemplates = buildTemplates(
      workerMember.firstName,
      workerMember.phone,
      memberName,
      caller.lastName,
      loginCodePlain,
    );

    return {
      journey,
      worker: {
        id: workerId,
        name: `${workerMember.firstName} ${workerMember.lastName}`,
        phone: workerMember.phone,
        isNewCode,
        loginCode: loginCodePlain,
        loginCodeGeneratedAt: new Date().toISOString(),
      },
      messageTemplates,
    };
  }

  // ── Existing methods unchanged ────────────────────────────────────────────

  async getFollowUpQueue(churchId: string) {
    const activeJourneyMemberIds = await this.journeyRepo
      .createQueryBuilder('j')
      .select('j.memberId', 'memberId')
      .where('j.churchId = :churchId AND j.status = :status', { churchId, status: JourneyStatus.ACTIVE })
      .andWhere('j.memberId IS NOT NULL')
      .getRawMany()
      .then((rows) => rows.map((r: any) => r.memberId as string));

    const qb = this.memberRepo
      .createQueryBuilder('m')
      .where('m.churchId = :churchId', { churchId })
      .andWhere(`(m.status = :nc OR :tag = ANY(m.tags))`, { nc: MemberStatus.NEW_CONVERT, tag: 'Follow-Up Needed' });

    if (activeJourneyMemberIds.length > 0) {
      qb.andWhere('m.id NOT IN (:...ids)', { ids: activeJourneyMemberIds });
    }
    return qb.orderBy('m.createdAt', 'ASC').getMany();
  }

  async getJourneysWithMembers(churchId: string) {
    const journeys = await this.journeyRepo.find({
      where: { churchId, status: JourneyStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
    if (!journeys.length) return [];

    const memberIds = journeys.map((j) => j.memberId).filter(Boolean);
    const members = memberIds.length ? await this.memberRepo.findByIds(memberIds) : [];
    const memberMap = new Map(members.map((m) => [m.id, m]));

    const taskCounts = await this.taskRepo
      .createQueryBuilder('t')
      .select('t.journeyId', 'journeyId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END)`, 'done')
      .where('t.churchId = :churchId AND t.journeyId IN (:...ids)', {
        churchId, ids: journeys.map((j) => j.id),
      })
      .groupBy('t.journeyId')
      .getRawMany();

    const progressMap = new Map(
      taskCounts.map((r: any) => [r.journeyId, { total: parseInt(r.total), done: parseInt(r.done) }]),
    );

    return journeys.map((j) => ({
      ...j,
      member: memberMap.get(j.memberId) ?? null,
      progress: progressMap.get(j.id) ?? { total: DEFAULT_JOURNEY_STEPS.length, done: 0 },
    }));
  }

  getActiveJourneys(churchId: string) {
    return this.journeyRepo.find({ where: { churchId, status: JourneyStatus.ACTIVE } });
  }

  getJourneyTasks(journeyId: string, churchId: string) {
    return this.taskRepo.find({ where: { journeyId, churchId }, order: { triggerAt: 'ASC' } });
  }

  async updateJourneyStatus(churchId: string, journeyId: string, status: JourneyStatus) {
    const update: Partial<FollowUpJourney> = { status };
    if (status === JourneyStatus.COMPLETED) update.completedAt = new Date();
    await this.journeyRepo.update({ id: journeyId, churchId }, update as any);
    return this.journeyRepo.findOne({ where: { id: journeyId, churchId } });
  }

  async completeTask(taskId: string) {
    await this.taskRepo.update(taskId, { status: TaskStatus.DONE, processedAt: new Date() });
  }

  async getStats(churchId: string) {
    const [active, completed, queueCount] = await Promise.all([
      this.journeyRepo.count({ where: { churchId, status: JourneyStatus.ACTIVE } }),
      this.journeyRepo.count({ where: { churchId, status: JourneyStatus.COMPLETED } }),
      this.getFollowUpQueue(churchId).then((q) => q.length),
    ]);
    return { active, completed, queueCount };
  }

  async getWorkerPortal(workerUserId: string, churchId: string) {
    const workerUser = await this.userRepo.findOne({ where: { id: workerUserId } });
    if (!workerUser) return null;

    const workerMember = await this.memberRepo.findOne({
      where: { phone: workerUser.phone ?? undefined, churchId },
    });
    const workerId = workerMember?.id;

    const today = dayjs().startOf('day').toDate();
    const tomorrow = dayjs().endOf('day').toDate();

    const [journeys, visits] = await Promise.all([
      workerId
        ? this.journeyRepo.find({
            where: { assignedWorkerId: workerId, churchId, status: JourneyStatus.ACTIVE },
            order: { createdAt: 'DESC' },
          })
        : [],
      workerId
        ? this.visitRepo.find({
            where: { workerId, churchId, status: VisitStatus.SCHEDULED, scheduledAt: MoreThanOrEqual(new Date()) },
            order: { scheduledAt: 'ASC' },
            take: 10,
          })
        : [],
    ]);

    const memberIds = journeys.map((j) => j.memberId).filter(Boolean);
    const members = memberIds.length ? await this.memberRepo.findByIds(memberIds) : [];
    const memberMap = new Map(members.map((m) => [m.id, m]));

    const taskCounts = journeys.length
      ? await this.taskRepo
          .createQueryBuilder('t')
          .select('t.journeyId', 'journeyId')
          .addSelect('COUNT(*)', 'total')
          .addSelect(`SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END)`, 'done')
          .where('t.journeyId IN (:...ids)', { ids: journeys.map((j) => j.id) })
          .groupBy('t.journeyId')
          .getRawMany()
      : [];

    const progressMap = new Map(
      taskCounts.map((r: any) => [r.journeyId, { total: parseInt(r.total), done: parseInt(r.done) }]),
    );

    const todaysTasks = journeys
      .filter((j) => j.urgent || (j.dueDate && j.dueDate >= today && j.dueDate <= tomorrow))
      .map((j) => ({ ...j, member: memberMap.get(j.memberId) ?? null }));

    const urgentCount = todaysTasks.filter((t) => t.urgent).length;

    const activeJourneys = journeys.map((j) => {
      const progress = progressMap.get(j.id) ?? { total: DEFAULT_JOURNEY_STEPS.length, done: 0 };
      const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : j.journeyProgress;
      return { ...j, member: memberMap.get(j.memberId) ?? null, progressPercent: pct, progress };
    });

    const [totalAssigned, converted] = await Promise.all([
      workerId ? this.journeyRepo.count({ where: { assignedWorkerId: workerId, churchId } }) : Promise.resolve(0),
      workerId ? this.journeyRepo.count({ where: { assignedWorkerId: workerId, churchId, status: JourneyStatus.COMPLETED } }) : Promise.resolve(0),
    ]);

    const retentionRate = totalAssigned > 0 ? Math.round((converted / totalAssigned) * 100) : 0;

    return {
      worker: {
        id: workerUser.id,
        firstName: workerUser.firstName,
        lastName: workerUser.lastName,
        role: workerUser.role,
        loginCodeUpdatedAt: workerUser.loginCodeUpdatedAt,
      },
      urgentCount,
      todaysTasks,
      activeJourneys,
      upcomingVisits: visits,
      retentionRate,
      stats: { totalAssigned, converted, active: journeys.length },
    };
  }

  async regenerateWorkerCode(workerUserId: string) {
    const user = await this.userRepo.findOne({ where: { id: workerUserId } });
    if (!user) throw new Error('Worker not found');

    const newCode = UsersService.generateLoginCode(user.firstName);
    const codeHash = UsersService.hashLoginCode(newCode);

    await this.userRepo.update(workerUserId, {
      loginCodeHash: codeHash,
      loginCodeUpdatedAt: new Date(),
      loginCodeFailedAttempts: 0,
      loginCodeLockedUntil: null,
    } as any);

    console.log(`[DEV] Regenerated worker code for ${user.firstName}: ${newCode}`);
    return { loginCodePlain: newCode, updatedAt: new Date() };
  }
}
