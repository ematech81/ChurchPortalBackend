import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createApp, resetDb, api, signUp, seniorPastor, sentOtps, nextIp, Session } from './helpers/app';

let app: INestApplication;
let ds: DataSource;

beforeAll(async () => {
  ({ app, ds } = await createApp());
});
beforeEach(async () => {
  await resetDb(ds);
});
afterAll(async () => {
  await app.close();
});

/** Senior pastor creates a branch + a pastor member with a phone, promotes them, returns ids. */
async function makeBranchPastor(sp: Session & { churchId: string }, phone: string) {
  const branch = (await api(app, sp).post('/churches/branch').send({ name: 'North Branch' }).expect(201)).body;
  const member = (
    await api(app, sp)
      .post('/members')
      .send({ firstName: 'Paul', lastName: 'Okoro', phone, churchRole: 'pastor' })
      .expect(201)
  ).body;
  await api(app, sp).post('/churches/pastors/promote-member').send({ memberId: member.id, branchId: branch.id }).expect(201);
  return { branch, member };
}

describe('C1 — mass assignment / privilege escalation', () => {
  it('rejects role/churchId in PATCH /users/me and never leaks hashes', async () => {
    const s = await signUp(app);
    await api(app, s).patch('/users/me').send({ role: 'super_admin' }).expect(400);
    await api(app, s).patch('/users/me').send({ churchId: '00000000-0000-0000-0000-000000000000' }).expect(400);

    const ok = await api(app, s).patch('/users/me').send({ firstName: 'Renamed' }).expect(200);
    expect(ok.body.firstName).toBe('Renamed');
    const me = await api(app, s).get('/users/me').expect(200);
    for (const k of ['passwordHash', 'refreshTokenHash', 'otpCode', 'pinHash', 'loginCodeHash']) {
      expect(me.body).not.toHaveProperty(k);
    }
    expect(me.body.role).toBe('member');
  });

  it('ignores churchId/id in member updates (cannot move a member to another tenant)', async () => {
    const a = await seniorPastor(app, { churchName: 'A' });
    const b = await seniorPastor(app, { churchName: 'B' });
    const m = (await api(app, a).post('/members').send({ firstName: 'X', lastName: 'Y', phone: '08011112222' }).expect(201)).body;
    await api(app, a).patch(`/members/${m.id}`).send({ churchId: b.churchId, firstName: 'Z' }).expect(200);
    const after = await api(app, a).get(`/members/${m.id}`).expect(200);
    expect(after.body.churchId).toBe(a.churchId);
    expect(after.body.firstName).toBe('Z');
  });

  it('cannot set subscription fields through PATCH /churches/me', async () => {
    const a = await seniorPastor(app);
    await api(app, a).patch('/churches/me').send({ subscriptionPlan: 'enterprise' }).expect(400);
  });
});

describe('C2 — refresh tokens', () => {
  it('accepts a real refresh token once, rotates it, and rejects the old one', async () => {
    const s = await signUp(app);
    const r1 = await api(app).post('/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
    expect(r1.body.accessToken).toBeTruthy();
    await api(app).post('/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401); // rotated out
    await api(app).post('/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(200);
  });

  it('rejects the bcrypt-72-byte forgery', async () => {
    const s = await signUp(app);
    const forged = s.refreshToken.slice(0, 72) + '.forged-tail';
    await api(app).post('/auth/refresh').send({ userId: s.user.id, refreshToken: forged }).expect(401);
  });

  it('refuses a refresh token used as an access token', async () => {
    const s = await signUp(app);
    await api(app, { accessToken: s.refreshToken, ip: nextIp() }).get('/users/me').expect(401);
  });
});

describe('C3 — worker codes cannot become another account', () => {
  it('does not mint a code for a pastor of another church matched by phone', async () => {
    const victim = await seniorPastor(app, { phone: '08031112222', churchName: 'Victim Church' });
    const attacker = await seniorPastor(app, { churchName: 'Attacker Church' });

    const fake = (
      await api(app, attacker).post('/members').send({ firstName: 'Fake', lastName: 'Worker', phone: '+234 803 111 2222' }).expect(201)
    ).body;
    const target = (await api(app, attacker).post('/members').send({ firstName: 'New', lastName: 'Convert', phone: '08099990000', status: 'new_convert' }).expect(201)).body;

    const res = await api(app, attacker)
      .post('/follow-up/journeys')
      .send({ memberId: target.id, decisionType: 'salvation', assignedWorkerId: fake.id })
      .expect(201);
    // The attacker gets a code for a NEW worker account inside the attacker's own church...
    const login = await api(app).post('/auth/worker/login').send({ code: res.body.worker.loginCode }).expect(200);
    expect(login.body.user.id).not.toBe(victim.user.id);
    expect(login.body.user.role).toBe('follow_up_worker');
    expect(login.body.user.churchId).toBe(attacker.churchId);

    // ...and the victim's account is untouched: no code, same role and church.
    const row = await ds.query(`SELECT "loginCodeHash", role, "churchId" FROM users WHERE id = $1`, [victim.user.id]);
    expect(row[0].loginCodeHash).toBeNull();
    expect(row[0].role).toBe('senior_pastor');
    expect(row[0].churchId).toBe(victim.churchId);
  });

  it('issues a working worker login that is restricted to worker permissions', async () => {
    const sp = await seniorPastor(app);
    const worker = (await api(app, sp).post('/members').send({ firstName: 'Wendy', lastName: 'Eze', phone: '08055550000', status: 'worker' }).expect(201)).body;
    const convert = (await api(app, sp).post('/members').send({ firstName: 'Cee', lastName: 'Ade', phone: '08066660000', status: 'new_convert' }).expect(201)).body;

    const res = await api(app, sp)
      .post('/follow-up/journeys')
      .send({ memberId: convert.id, decisionType: 'salvation', assignedWorkerId: worker.id })
      .expect(201);
    const code = res.body.worker.loginCode as string;
    expect(code).toMatch(/^wendy-[a-z2-9]{8}$/);

    const login = await api(app).post('/auth/worker/login').send({ code: code.toUpperCase() }).expect(200);
    expect(login.body.user.role).toBe('follow_up_worker');
    const w: Session = { ...login.body, ip: nextIp() };

    await api(app, w).get('/follow-up/worker/portal').expect(200);
    await api(app, w).get('/members').expect(403);
    await api(app, w).get('/giving').expect(403);
    await api(app, w).get('/follow-up/dispatch-log').expect(403);
    await api(app, w).post('/messaging/sms').send({ to: '08011112222', message: 'hi' }).expect(403);
  });

  it('a worker code never opens a non-worker account', async () => {
    const sp = await seniorPastor(app);
    const code = 'pastor-abcdefgh';
    await ds.query(`UPDATE users SET "loginCodeHash" = $1 WHERE id = $2`, [
      require('crypto').createHash('sha256').update(code).digest('hex'),
      sp.user.id,
    ]);
    await api(app).post('/auth/worker/login').send({ code }).expect(401);
  });

  it('re-assigning an existing journey really changes the worker', async () => {
    const sp = await seniorPastor(app);
    const w1 = (await api(app, sp).post('/members').send({ firstName: 'One', lastName: 'W', phone: '08010000001', status: 'worker' }).expect(201)).body;
    const w2 = (await api(app, sp).post('/members').send({ firstName: 'Two', lastName: 'W', phone: '08010000002', status: 'worker' }).expect(201)).body;
    const c = (await api(app, sp).post('/members').send({ firstName: 'C', lastName: 'C', phone: '08010000003', status: 'new_convert' }).expect(201)).body;
    await api(app, sp).post('/follow-up/journeys').send({ memberId: c.id, decisionType: 'salvation', assignedWorkerId: w1.id }).expect(201);
    const again = await api(app, sp).post('/follow-up/journeys').send({ memberId: c.id, decisionType: 'salvation', assignedWorkerId: w2.id }).expect(201);
    expect(again.body.journey.assignedWorkerId).toBe(w2.id);
    const rows = await ds.query(`SELECT count(*)::int AS n FROM follow_up_journeys WHERE "memberId" = $1`, [c.id]);
    expect(rows[0].n).toBe(1);
  });
});

describe('C4 — pastor OTP login', () => {
  it('rejects empty/garbage bodies instead of matching an arbitrary user', async () => {
    await seniorPastor(app, { phone: '08030000001' });
    await api(app).post('/auth/login-pastor').send({}).expect(400);
    await api(app).post('/auth/verify-pastor-otp').send({ code: '123456' }).expect(400);
    await api(app).post('/auth/resend-pastor-otp').send({}).expect(400);
    await api(app).post('/auth/login-pastor').send({ phone: { $ne: 1 } }).expect(400);
  });

  it('only branch pastors can use phone login (a senior pastor cannot)', async () => {
    await seniorPastor(app, { phone: '08030000002' });
    const res = await api(app).post('/auth/login-pastor').send({ phone: '08030000002' });
    expect(res.status).toBe(403);
    await api(app).post('/auth/resend-pastor-otp').send({ phone: '08030000002' }).expect(403);
  });

  it('full branch-pastor login works across phone formats; OTP is single-use and hashed', async () => {
    const sp = await seniorPastor(app);
    await makeBranchPastor(sp, '0803 555 7777');

    const start = await api(app).post('/auth/login-pastor').send({ phone: '+2348035557777' }).expect(200);
    expect(start.body.delivery).toBe('dev');
    const code = start.body.devCode as string;
    const stored = await ds.query(`SELECT "otpCode" FROM users WHERE phone = $1`, ['0803 555 7777']);
    expect(stored[0].otpCode).not.toBe(code); // not stored in plaintext

    const ok = await api(app).post('/auth/verify-pastor-otp').send({ phone: '08035557777', code }).expect(200);
    expect(ok.body.user.role).toBe('branch_pastor');
    await api(app).post('/auth/verify-pastor-otp').send({ phone: '08035557777', code }).expect(400); // used up
  });

  it('locks the code after 5 wrong guesses (even if the 6th is right)', async () => {
    const sp = await seniorPastor(app);
    await makeBranchPastor(sp, '08035558888');
    const start = await api(app).post('/auth/login-pastor').send({ phone: '08035558888' }).expect(200);
    const right = start.body.devCode as string;
    const wrong = right === '000000' ? '111111' : '000000';

    // Fresh IP per attempt: the OTP lock is per account and must hold even for a distributed attacker.
    const attempt = (code: string) => api(app).post('/auth/verify-pastor-otp').send({ phone: '08035558888', code });
    for (let i = 0; i < 4; i++) await attempt(wrong).expect(401);
    await attempt(wrong).expect(400); // 5th → locked
    await attempt(right).expect(400); // code destroyed
  });
});

describe('C5 — authentication and role enforcement', () => {
  it('requires a token everywhere except health/auth', async () => {
    await api(app).get('/health').expect(200);
    for (const path of ['/members', '/giving', '/churches/me', '/users/me', '/dashboard/stats', '/attendance/events']) {
      await api(app).get(path).expect(401);
    }
  });

  it('a user with no church cannot read any tenant data (no undefined-churchId leak)', async () => {
    const other = await seniorPastor(app);
    await api(app, other).post('/members').send({ firstName: 'Secret', lastName: 'Person', phone: '08012345678' }).expect(201);
    const lonely = await signUp(app);
    await api(app, lonely).get('/members').expect(403);
    await api(app, lonely).get('/churches/me').expect(403);
  });

  it('branch pastor is blocked from HQ-only actions; pastors can still do their own work', async () => {
    const sp = await seniorPastor(app);
    const { branch } = await makeBranchPastor(sp, '08035559999');
    const start = await api(app).post('/auth/login-pastor').send({ phone: '08035559999' }).expect(200);
    const login = await api(app).post('/auth/verify-pastor-otp').send({ phone: '08035559999', code: start.body.devCode }).expect(200);
    const bp: Session = { ...login.body, ip: nextIp() };

    await api(app, bp).post('/churches/branch').send({ name: 'Rogue' }).expect(403);
    await api(app, bp).get('/churches/branches').expect(403);
    await api(app, bp).delete(`/churches/branch/${branch.id}`).expect(403);
    await api(app, bp).get('/members').expect(200);
    await api(app, bp).post('/members').send({ firstName: 'B', lastName: 'M', phone: '08020202020' }).expect(201);
    // and a branch pastor's data is scoped to the branch, not HQ
    const list = await api(app, bp).get('/members').expect(200);
    expect(list.body.every((m: any) => m.churchId === branch.id)).toBe(true);
  });

  it('plain members get nothing; ushers can take attendance but not see giving', async () => {
    const sp = await seniorPastor(app);
    const plain = await signUp(app);
    await ds.query(`UPDATE users SET "churchId" = $1, role = 'member' WHERE id = $2`, [sp.churchId, plain.user.id]);
    await api(app, plain).get('/members').expect(403);
    await api(app, plain).get('/giving').expect(403);

    const usher = await signUp(app);
    await ds.query(`UPDATE users SET "churchId" = $1, role = 'usher' WHERE id = $2`, [sp.churchId, usher.user.id]);
    await api(app, usher).get('/attendance/events').expect(200);
    await api(app, usher).get('/giving').expect(403);
    await api(app, usher).post('/attendance/events').send({ title: 'x', type: 'sunday', date: new Date().toISOString() }).expect(403);
  });

  it('role changes take effect immediately (not after the token expires)', async () => {
    const sp = await seniorPastor(app);
    const u = await signUp(app);
    await ds.query(`UPDATE users SET "churchId" = $1, role = 'finance_officer' WHERE id = $2`, [sp.churchId, u.user.id]);
    await api(app, u).get('/giving').expect(200);
    await ds.query(`UPDATE users SET role = 'member' WHERE id = $1`, [u.user.id]);
    await api(app, u).get('/giving').expect(403);
    await ds.query(`UPDATE users SET "isActive" = false WHERE id = $1`, [u.user.id]);
    await api(app, u).get('/users/me').expect(401);
  });
});

describe('C6 — tenant isolation', () => {
  it('cannot read, assign or promote across churches', async () => {
    const a = await seniorPastor(app, { churchName: 'A' });
    const b = await seniorPastor(app, { churchName: 'B' });
    const { member: aMember, branch: aBranch } = await makeBranchPastor(a, '08037770000');
    const bBranch = (await api(app, b).post('/churches/branch').send({ name: 'B1' }).expect(201)).body;

    // read another tenant's member
    await api(app, b).get(`/members/${aMember.id}`).expect(404);

    // B tries to move A's branch pastor into B's branch
    const pastors = (await api(app, a).get('/churches/pastors').expect(200)).body;
    await api(app, b).patch(`/churches/pastors/${pastors[0].id}/assign`).send({ branchId: bBranch.id }).expect(404);

    // B tries to promote A's member
    await api(app, b).post('/churches/pastors/promote-member').send({ memberId: aMember.id, branchId: bBranch.id }).expect(404);

    // B tries to use A's branch as a target
    const bMember = (await api(app, b).post('/members').send({ firstName: 'Q', lastName: 'Q', phone: '08041112222' }).expect(201)).body;
    await api(app, b).post('/churches/pastors/promote-member').send({ memberId: bMember.id, branchId: aBranch.id }).expect(404);
  });

  it('promoting a member never hijacks another church\'s senior pastor by phone', async () => {
    const victim = await seniorPastor(app, { phone: '08038880000', churchName: 'V' });
    const b = await seniorPastor(app, { churchName: 'B' });
    const branch = (await api(app, b).post('/churches/branch').send({ name: 'B1' }).expect(201)).body;
    const m = (await api(app, b).post('/members').send({ firstName: 'Evil', lastName: 'Twin', phone: '+234 803 888 0000', churchRole: 'pastor' }).expect(201)).body;
    await api(app, b).post('/churches/pastors/promote-member').send({ memberId: m.id, branchId: branch.id }).expect(409);
    const row = await ds.query(`SELECT role, "churchId" FROM users WHERE id = $1`, [victim.user.id]);
    expect(row[0].role).toBe('senior_pastor');
    expect(row[0].churchId).toBe(victim.churchId);
  });

  it('promotes a member who has no email (used to crash with a NOT NULL error)', async () => {
    const sp = await seniorPastor(app);
    const r = await makeBranchPastor(sp, '08036660000');
    expect(r.member.email).toBeNull();
  });

  it('attendance/giving refuse foreign member and event ids', async () => {
    const a = await seniorPastor(app, { churchName: 'A' });
    const b = await seniorPastor(app, { churchName: 'B' });
    const aMember = (await api(app, a).post('/members').send({ firstName: 'M', lastName: 'A', phone: '08040000001' }).expect(201)).body;
    const bEvent = (await api(app, b).post('/attendance/events').send({ title: 'Sun', type: 'sunday', date: new Date().toISOString() }).expect(201)).body;
    await api(app, b).post(`/attendance/events/${bEvent.id}/check-in`).send({ memberId: aMember.id }).expect(400);
    await api(app, b).post('/giving').send({ fund: 'tithe', amount: 100, memberId: aMember.id }).expect(400);
    const aEvent = (await api(app, a).post('/attendance/events').send({ title: 'Sun', type: 'sunday', date: new Date().toISOString() }).expect(201)).body;
    await api(app, b).post(`/attendance/events/${aEvent.id}/check-in`).send({ memberId: aMember.id }).expect(404);
  });
});

describe('C9 — rate limiting', () => {
  it('throttles repeated bad logins from one IP', async () => {
    const c = api(app);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await c.post('/auth/login').send({ email: 'nobody@test.dev', password: 'wrong-pass' });
      statuses.push(r.status);
    }
    expect(statuses).toContain(429);
    // a different IP is unaffected
    await api(app).post('/auth/login').send({ email: 'nobody@test.dev', password: 'wrong-pass' }).expect(401);
  });
});

describe('Input validation and data integrity', () => {
  it('validates giving, hides anonymous donors, and rejects bad filters', async () => {
    const sp = await seniorPastor(app);
    const m = (await api(app, sp).post('/members').send({ firstName: 'Don', lastName: 'Or', phone: '08050505050' }).expect(201)).body;

    await api(app, sp).post('/giving').send({ fund: 'tithe', amount: -5 }).expect(400);
    await api(app, sp).post('/giving').send({ fund: 'bogus', amount: 5 }).expect(400);
    await api(app, sp).post('/giving').send({ fund: 'tithe', amount: 5, extra: 1 }).expect(400);
    await api(app, sp).post('/giving').send({ fund: 'tithe', amount: 5000, memberId: m.id, isAnonymous: true }).expect(201);
    await api(app, sp).post('/giving').send({ fund: 'offering', amount: 2500.5, memberId: m.id }).expect(201);

    const list = (await api(app, sp).get('/giving').expect(200)).body;
    const anon = list.find((r: any) => Number(r.amount) === 5000);
    expect(anon.member).toBeNull();
    expect(anon.memberId).toBeNull();
    expect((await api(app, sp).get(`/giving/members/${m.id}`).expect(200)).body).toHaveLength(1);

    await api(app, sp).get('/giving/summary?from=nope&to=nope').expect(400);
    const month = (await api(app, sp).get('/giving/summary/month').expect(200)).body;
    expect(month.grandTotal).toBe(7500.5);

    await api(app, sp).get('/members?status=bogus').expect(400);
    await api(app, sp).get('/members/not-a-uuid').expect(400);
    await api(app, sp).post('/members').send({ firstName: 'NoPhone', lastName: 'X' }).expect(400);
  });

  it('member IDs stay unique after a delete', async () => {
    const sp = await seniorPastor(app);
    const m1 = (await api(app, sp).post('/members').send({ firstName: 'A', lastName: 'A', phone: '08060000001' }).expect(201)).body;
    const m2 = (await api(app, sp).post('/members').send({ firstName: 'B', lastName: 'B', phone: '08060000002' }).expect(201)).body;
    await api(app, sp).delete(`/members/${m1.id}`).expect(204);
    const m3 = (await api(app, sp).post('/members').send({ firstName: 'C', lastName: 'C', phone: '08060000003' }).expect(201)).body;
    expect(new Set([m1.memberId, m2.memberId, m3.memberId]).size).toBe(3);
  });

  it('onboarding is idempotent (retrying does not create a second church)', async () => {
    const s = await signUp(app);
    await api(app, s).post('/churches').send({ name: 'Once' }).expect(201);
    const again = await api(app, s).post('/churches').send({ name: 'Once Renamed' }).expect(201);
    expect(again.body.church.name).toBe('Once Renamed');
    const n = await ds.query(`SELECT count(*)::int AS n FROM churches`);
    expect(n[0].n).toBe(1);
    // and a client can't choose a parent church
    await api(app, s).post('/churches').send({ name: 'X', parentChurchId: again.body.church.id }).expect(400);
  });

  it('unverified-account password pre-hijack is closed', async () => {
    const c = api(app);
    const email = `victim${Date.now()}@test.dev`;
    await c.post('/auth/register').send({ firstName: 'Evil', lastName: 'One', email, password: 'attackerpass1' }).expect(201);
    await c.post('/auth/register').send({ firstName: 'Real', lastName: 'Owner', email, password: 'ownerpass123' }).expect(201);
    await c.post('/auth/verify-otp').send({ email, code: sentOtps.get(email)! }).expect(200);
    await api(app).post('/auth/login').send({ email, password: 'attackerpass1' }).expect(401);
    await api(app).post('/auth/login').send({ email, password: 'ownerpass123' }).expect(200);
  });
});
