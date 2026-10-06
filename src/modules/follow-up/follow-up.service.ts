import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository, MoreThanOrEqual, In, LessThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { FollowUpJourney, JourneyStatus } from './follow-up-journey.entity';
import { FollowUpTask, TaskStatus } from './follow-up-task.entity';
import { WorkerCodeDispatchLog } from './worker-code-dispatch-log.entity';
import { Member } from '../members/member.entity';
import { User } from '../users/user.entity';
import { Visit, VisitStatus } from '../visits/visit.entity';
import { MemberStatus, UserRole } from '@/types';
import { UsersService } from '../users/users.service';
import { phoneDigitVariants, sqlDigits } from '../../common/utils/phone';
import { BCRYPT_ROUNDS } from '../../common/utils/hash';
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

/** A plaintext worker code is kept in the dispatch log this long, then wiped. */
const CODE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Roles we are willing to upgrade into a follow-up worker. Anyone with a real role keeps their own login. */
const UPGRADABLE_ROLES: string[] = [UserRole.MEMBER, UserRole.FOLLOW_UP_WORKER];

// ── Message template builder ──────────────────────────────────────────────────
// All templates stay in one place — swap content or add languages here later.

function buildTemplates(
  workerFirstName: string,
  workerPhone: string | null,
  memberName: string,
  pastorLastName: string,
  loginCode: string | null,
) {
  const codeLine = loginCode
    ? `Your login code: *${loginCode}*\n\nOpen the app and tap the "Worker" login tab.`
    : `Sign in to Kingdom Portal with your existing login.`;
  const codeShort = loginCode ? `Kingdom Portal code: ${loginCode}. Open app > Worker tab.` : `Open Kingdom Portal to see your assignment.`;
  const phone = workerPhone?.replace(/\D/g, '') ?? '';

  const whatsapp =
    `Hi ${workerFirstName}! Pst. ${pastorLastName} has assigned you to follow up with ${memberName} on Kingdom Portal.\n\n` +
    `${codeLine} God bless!`;

  const sms = `Hi ${workerFirstName}, Pst. ${pastorLastName} assigned you: ${memberName}. ${codeShort}`;

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
  private readonly logger = new Logger(FollowUpService.name);

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

  // ── Member lookups (always tenant-scoped) ─────────────────────────────────

  private async _memberOrFail(id: string, churchId: string, what = 'Member'): Promise<Member> {
    const m = await this.memberRepo.findOne({ where: { id, churchId } });
    if (!m) throw new NotFoundException(`${what} not found`);
    return m;
  }

  // ── Ensure worker has a User account + login code ─────────────────────────
  // Returns the plaintext code ONLY when a new code was generated.
  //
  // Security: accounts are matched by phone WITHIN THIS CHURCH ONLY, and an account
  // that already has a real role (pastor, admin, usher…) is never given a worker
  // code — that code would be a second, weaker way to sign in as that person.
  private async _ensureWorkerCode(
    workerMember: Member,
    churchId: string,
  ): Promise<{ userId: string; loginCodePlain: string | null; isNewCode: boolean }> {
    const variants = phoneDigitVariants(workerMember.phone);

    let workerUser = variants.length
      ? await this.userRepo
          .createQueryBuilder('u')
          .addSelect('u.loginCodeHash')
          .where(`${sqlDigits('u.phone')} IN (:...variants)`, { variants })
          .andWhere('u.churchId = :churchId', { churchId })
          .orderBy('u.createdAt', 'ASC')
          .getOne()
      : null;

    if (workerUser && !UPGRADABLE_ROLES.includes(workerUser.role)) {
      // e.g. the person is also a pastor: they use their own login, no code issued.
      return { userId: workerUser.id, loginCodePlain: null, isNewCode: false };
    }

    if (!workerUser) {
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
      const loginCodePlain = UsersService.generateLoginCode(workerMember.firstName);

      workerUser = await this.userRepo.save(
        this.userRepo.create({
          firstName: workerMember.firstName,
          lastName: workerMember.lastName,
          phone: workerMember.phone,
          // Worker accounts have no mailbox; a unique placeholder keeps the NOT NULL/unique column happy.
          email: `worker-${workerMember.id}@portal.internal`,
          role: UserRole.FOLLOW_UP_WORKER,
          churchId,
          passwordHash,
          isEmailVerified: true,
          loginCodeHash: UsersService.hashLoginCode(loginCodePlain),
          loginCodeUpdatedAt: new Date(),
        }),
      );
      return { userId: workerUser.id, loginCodePlain, isNewCode: true };
    }

    // Existing member-role or worker account in this church.
    if (workerUser.role === UserRole.MEMBER) {
      await this.userRepo.update(workerUser.id, { role: UserRole.FOLLOW_UP_WORKER });
    }
    if (!workerUser.loginCodeHash) {
      const loginCodePlain = UsersService.generateLoginCode(workerMember.firstName);
      await this.userRepo.update(workerUser.id, {
        loginCodeHash: UsersService.hashLoginCode(loginCodePlain),
        loginCodeUpdatedAt: new Date(),
      } as any);
      return { userId: workerUser.id, loginCodePlain, isNewCode: true };
    }

    return { userId: workerUser.id, loginCodePlain: null, isNewCode: false };
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
    // Opportunistic cleanup so plaintext codes don't live in the table forever.
    await this.dispatchLogRepo.update(
      { expiresAt: LessThan(new Date()) },
      { code: null },
    );
    await this.dispatchLogRepo.save(
      this.dispatchLogRepo.create({
        workerId:   opts.workerId,
        workerName: opts.workerName,
        workerPhone: opts.workerPhone,
        code:       opts.code,
        assignedBy: opts.assignedBy,
        churchId:   opts.churchId,
        channel:    opts.channel ?? 'pending_manual',
        expiresAt:  new Date(Date.now() + CODE_RETENTION_MS),
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
    const targetMember = await this._memberOrFail(memberId, churchId);
    const workerMember = assignedWorkerId
      ? await this._memberOrFail(assignedWorkerId, churchId, 'Worker')
      : null;

    let journey = await this.journeyRepo.findOne({
      where: { churchId, memberId, status: JourneyStatus.ACTIVE },
    });

    if (journey) {
      // A journey already exists. Without a new worker there is nothing to do; with
      // one, this is a (re)assignment and must actually take effect.
      if (!workerMember) return { journey, worker: null, messageTemplates: null };
      await this.journeyRepo.update({ id: journey.id, churchId }, { assignedWorkerId: workerMember.id });
      journey = (await this.journeyRepo.findOne({ where: { id: journey.id, churchId } }))!;
    } else {
      journey = await this.journeyRepo.save(
        this.journeyRepo.create({
          churchId,
          memberId,
          decisionType,
          assignedWorkerId: workerMember?.id ?? null,
        }),
      );
      await this._scheduleTasks(churchId, journey.id);
    }

    if (!workerMember || !caller) return { journey, worker: null, messageTemplates: null };
    return this._buildAssignmentResult(journey, workerMember, targetMember, churchId, caller);
  }

  private async _scheduleTasks(churchId: string, journeyId: string) {
    const now = dayjs();
    const tasks = DEFAULT_JOURNEY_STEPS.map((step) =>
      this.taskRepo.create({
        churchId, journeyId,
        type: step.type as never,
        triggerAt: now.add(step.dayOffset, 'day').toDate(),
        payload: { label: step.label },
      }),
    );
    const savedTasks = await this.taskRepo.save(tasks);
    for (const task of savedTasks) {
      try {
        const delay = Math.max(0, task.triggerAt.getTime() - Date.now());
        await this.queue.add(
          'process-task',
          { taskId: task.id },
          {
            delay,
            attempts: 3,
            backoff: { type: 'exponential', delay: 60_000 },
            removeOnComplete: true,
            removeOnFail: 200,
          },
        );
      } catch (err: any) {
        // The task row stays PENDING; a reconciler can re-enqueue it. Never fail the request over this.
        this.logger.warn(`Could not enqueue task ${task.id}: ${err?.message ?? err}`);
      }
    }
  }

  private async _buildAssignmentResult(
    journey: FollowUpJourney,
    workerMember: Member,
    targetMember: Member | null,
    churchId: string,
    caller: { id: string; firstName: string; lastName: string },
  ) {
    const { loginCodePlain, isNewCode } = await this._ensureWorkerCode(workerMember, churchId);

    await this._logDispatch({
      workerId:   workerMember.id,
      workerName: `${workerMember.firstName} ${workerMember.lastName}`,
      workerPhone: workerMember.phone,
      code:       loginCodePlain,
      assignedBy: caller.id,
      churchId,
    });

    const memberName = targetMember
      ? `${targetMember.firstName} ${targetMember.lastName}`
      : 'your assigned member';

    return {
      journey,
      worker: {
        id:                   workerMember.id,
        name:                 `${workerMember.firstName} ${workerMember.lastName}`,
        phone:                workerMember.phone,
        isNewCode,
        loginCode:            loginCodePlain,
        loginCodeGeneratedAt: new Date().toISOString(),
      },
      messageTemplates: buildTemplates(
        workerMember.firstName,
        workerMember.phone,
        memberName,
        caller.lastName,
        loginCodePlain,
      ),
    };
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
    const workerMember = await this._memberOrFail(workerId, churchId, 'Worker');

    // Most recent dispatch with a still-retained code, so we can re-send it.
    const latestLog = await this.dispatchLogRepo.findOne({
      where: { workerId, churchId },
      order: { createdAt: 'DESC' },
    });
    const liveCode = latestLog?.code && latestLog.expiresAt && latestLog.expiresAt > new Date()
      ? latestLog.code
      : null;

    // Member context
    let memberName = 'your assigned member';
    const journey = journeyId
      ? await this.journeyRepo.findOne({ where: { id: journeyId, churchId } })
      : await this.journeyRepo.findOne({
          where: { assignedWorkerId: workerId, churchId, status: JourneyStatus.ACTIVE },
          order: { createdAt: 'DESC' },
        });
    if (journey) {
      const m = await this.memberRepo.findOne({ where: { id: journey.memberId, churchId } });
      if (m) memberName = `${m.firstName} ${m.lastName}`;
    }

    const templates = buildTemplates(
      workerMember.firstName,
      workerMember.phone,
      memberName,
      callerLastName,
      liveCode,
    );

    await this._logDispatch({
      workerId,
      workerName: `${workerMember.firstName} ${workerMember.lastName}`,
      workerPhone: workerMember.phone,
      code: liveCode,
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

  // ── getDispatchLog ────────────────────────────────────────────────────────

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
    const existing = await this.journeyRepo.findOne({ where: { id: journeyId, churchId } });
    if (!existing) throw new NotFoundException('Journey not found');
    const workerMember = await this._memberOrFail(workerId, churchId, 'Worker');

    await this.journeyRepo.update({ id: journeyId, churchId }, { assignedWorkerId: workerMember.id });
    const journey = (await this.journeyRepo.findOne({ where: { id: journeyId, churchId } }))!;

    if (!caller) return { journey, worker: null, messageTemplates: null };

    const targetMember = await this.memberRepo.findOne({ where: { id: journey.memberId, churchId } });
    return this._buildAssignmentResult(journey, workerMember, targetMember, churchId, caller);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

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
    const members = memberIds.length ? await this.memberRepo.findBy({ id: In(memberIds), churchId }) : [];
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
    const journey = await this.journeyRepo.findOne({ where: { id: journeyId, churchId } });
    if (!journey) throw new NotFoundException('Journey not found');
    const update: Partial<FollowUpJourney> = { status };
    if (status === JourneyStatus.COMPLETED) update.completedAt = new Date();
    await this.journeyRepo.update({ id: journeyId, churchId }, update as any);

    if (status === JourneyStatus.COMPLETED) {
      // Graduation: take them out of the queue for good, otherwise a flagged member (or a
      // new convert) would pop straight back into "Pending follow-ups".
      const m = await this.memberRepo.findOne({ where: { id: journey.memberId, churchId } });
      if (m) {
        const tags = (m.tags ?? []).filter((t) => t !== 'Follow-Up Needed');
        const patch: Partial<Member> = { tags };
        if (m.status === MemberStatus.NEW_CONVERT) patch.status = MemberStatus.MEMBER;
        await this.memberRepo.update({ id: m.id, churchId }, patch as any);
      }
    }
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

  // ── Worker portal ─────────────────────────────────────────────────────────

  /** The Member record that corresponds to a signed-in user, matched by phone within the church. */
  private async _memberForUser(user: User, churchId: string): Promise<Member | null> {
    const variants = phoneDigitVariants(user.phone);
    if (!variants.length) return null; // never query with an empty filter
    return this.memberRepo
      .createQueryBuilder('m')
      .where('m.churchId = :churchId', { churchId })
      .andWhere(`${sqlDigits('m.phone')} IN (:...variants)`, { variants })
      .orderBy('m.createdAt', 'ASC')
      .getOne();
  }

  async getWorkerPortal(workerUserId: string, churchId: string) {
    const workerUser = await this.userRepo.findOne({ where: { id: workerUserId } });
    if (!workerUser) throw new NotFoundException('Account not found');

    const workerMember = await this._memberForUser(workerUser, churchId);
    const workerId = workerMember?.id; // journeys point at the worker's MEMBER id

    const today = dayjs().startOf('day').toDate();
    const endOfToday = dayjs().endOf('day').toDate();

    const [journeys, visits] = await Promise.all([
      workerId
        ? this.journeyRepo.find({
            where: { assignedWorkerId: workerId, churchId, status: JourneyStatus.ACTIVE },
            order: { createdAt: 'DESC' },
          })
        : [],
      // Visits are owned by the signed-in USER (see VisitsService.create), not the member record.
      this.visitRepo.find({
        where: { workerId: workerUserId, churchId, status: VisitStatus.SCHEDULED, scheduledAt: MoreThanOrEqual(new Date()) },
        order: { scheduledAt: 'ASC' },
        take: 10,
      }),
    ]);

    const memberIds = journeys.map((j) => j.memberId).filter(Boolean);
    const members = memberIds.length ? await this.memberRepo.findBy({ id: In(memberIds), churchId }) : [];
    const memberMap = new Map(members.map((m) => [m.id, m]));

    const taskCounts = journeys.length
      ? await this.taskRepo
          .createQueryBuilder('t')
          .select('t.journeyId', 'journeyId')
          .addSelect('COUNT(*)', 'total')
          .addSelect(`SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END)`, 'done')
          .where('t.churchId = :churchId AND t.journeyId IN (:...ids)', { churchId, ids: journeys.map((j) => j.id) })
          .groupBy('t.journeyId')
          .getRawMany()
      : [];

    const progressMap = new Map(
      taskCounts.map((r: any) => [r.journeyId, { total: parseInt(r.total), done: parseInt(r.done) }]),
    );

    const todaysTasks = journeys
      .filter((j) => j.urgent || (j.dueDate && j.dueDate >= today && j.dueDate <= endOfToday))
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
    if (!user) throw new NotFoundException('Worker not found');
    if (user.role !== UserRole.FOLLOW_UP_WORKER) {
      throw new BadRequestException('Only follow-up worker accounts have a login code.');
    }

    const newCode = UsersService.generateLoginCode(user.firstName);
    await this.userRepo.update(workerUserId, {
      loginCodeHash: UsersService.hashLoginCode(newCode),
      loginCodeUpdatedAt: new Date(),
      loginCodeFailedAttempts: 0,
      loginCodeLockedUntil: null,
    } as any);

    return { loginCodePlain: newCode, updatedAt: new Date() };
  }
}
