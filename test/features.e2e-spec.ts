import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createApp, resetDb, api, seniorPastor, signUp, nextIp, Session } from './helpers/app';

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

type Senior = Session & { churchId: string };

async function branchWithPastor(sp: Senior, phone: string, name = 'North') {
  const branch = (await api(app, sp).post('/churches/branch').send({ name }).expect(201)).body;
  const pastor = (await api(app, sp).post('/members').send({ firstName: 'Paul', lastName: name, phone, churchRole: 'pastor' }).expect(201)).body;
  await api(app, sp).post('/churches/pastors/promote-member').send({ memberId: pastor.id, branchId: branch.id }).expect(201);
  const start = await api(app).post('/auth/login-pastor').send({ phone }).expect(200);
  const login = await api(app).post('/auth/verify-pastor-otp').send({ phone, code: start.body.devCode }).expect(200);
  const session: Session = { ...login.body, ip: nextIp() };
  return { branch, session };
}

describe('Organisation scope for the Senior Pastor', () => {
  it('senior sees all branches with scope=all; branch pastor can never widen their view', async () => {
    const sp = await seniorPastor(app);
    const { branch, session: bp } = await branchWithPastor(sp, '08071000001');

    await api(app, sp).post('/members').send({ firstName: 'Hq', lastName: 'One', phone: '08072000001', status: 'member' }).expect(201);
    const branchMember = (await api(app, bp).post('/members').send({ firstName: 'Br', lastName: 'One', phone: '08072000002', status: 'member' }).expect(201)).body;

    const own = (await api(app, sp).get('/members?limit=500').expect(200)).body.map((m: any) => m.firstName);
    expect(own).toContain('Hq');
    expect(own).not.toContain('Br');

    const all = (await api(app, sp).get('/members?scope=all&limit=500').expect(200)).body.map((m: any) => m.firstName);
    expect(all).toEqual(expect.arrayContaining(['Hq', 'Br']));

    expect(Number((await api(app, sp).get('/members/count?scope=all').expect(200)).text)).toBeGreaterThanOrEqual(3);

    // the branch pastor asking for scope=all still only gets their branch
    const bpAll = (await api(app, bp).get('/members?scope=all&limit=500').expect(200)).body;
    expect(bpAll.every((m: any) => m.churchId === branch.id)).toBe(true);

    // senior can open and edit a branch member; the member stays in its own branch
    await api(app, sp).get(`/members/${branchMember.id}`).expect(200);
    await api(app, sp).patch(`/members/${branchMember.id}`).send({ firstName: 'Brenda' }).expect(200);
    const row = await ds.query(`SELECT "churchId", "firstName" FROM members WHERE id = $1`, [branchMember.id]);
    expect(row[0].churchId).toBe(branch.id);
    expect(row[0].firstName).toBe('Brenda');

    // a branch member can never be reached by an unrelated church
    const other = await seniorPastor(app, { churchName: 'Elsewhere' });
    await api(app, other).get(`/members/${branchMember.id}`).expect(404);
  });

  it('dashboard sums the organisation for the senior, but only the branch for a branch pastor', async () => {
    const sp = await seniorPastor(app);
    const { branch, session: bp } = await branchWithPastor(sp, '08073000001');
    await api(app, sp).post('/members').send({ firstName: 'A', lastName: 'A', phone: '08074000001' }).expect(201);
    await api(app, bp).post('/members').send({ firstName: 'B', lastName: 'B', phone: '08074000002' }).expect(201);
    await api(app, bp).post('/members').send({ firstName: 'C', lastName: 'C', phone: '08074000003', status: 'deceased' }).expect(201);

    const seniorStats = (await api(app, sp).get('/dashboard/stats').expect(200)).body;
    const branchStats = (await api(app, bp).get('/dashboard/stats').expect(200)).body;

    expect(seniorStats.scope).toBe('organisation');
    // HQ: A + the promoted pastor's member row (moved to the branch) ... branch: pastor + B (deceased C excluded)
    expect(seniorStats.totalMembers).toBe(1 + 2);
    expect(seniorStats.totalBranches).toBe(1);
    expect(seniorStats.branchBreakdown.map((b: any) => b.id)).toContain(branch.id);
    expect(branchStats.scope).toBe('church');
    expect(branchStats.totalMembers).toBe(2);
    expect(branchStats.branchBreakdown).toBeNull();
  });
});

describe('Bulk messaging', () => {
  it('is admin-only, church-scoped, skips opted-out members and survives gateway failure', async () => {
    const sp = await seniorPastor(app);
    const other = await seniorPastor(app, { churchName: 'Other' });
    const mk = async (n: string, extra: object = {}) =>
      (await api(app, sp).post('/members').send({ firstName: n, lastName: 'X', phone: `0809${Math.floor(Math.random() * 1e7)}`, ...extra }).expect(201)).body;
    const m1 = await mk('One');
    const m2 = await mk('Two', { smsOptIn: false });
    const foreign = (await api(app, other).post('/members').send({ firstName: 'F', lastName: 'F', phone: '08090000000' }).expect(201)).body;

    const res = await api(app, sp).post('/messaging/send-bulk').send({ memberIds: [m1.id, m2.id, foreign.id], body: 'Hello' }).expect(201);
    // BulkSMS isn't configured in tests, so the one eligible send fails — but the call itself succeeds.
    expect(res.body).toEqual({ requested: 3, sent: 0, failed: 1, skipped: 2 });

    // fresh IPs: the bulk endpoint deliberately allows only ~1 call per second per client
    const fresh = () => api(app, { accessToken: sp.accessToken, ip: nextIp() });
    await fresh().post('/messaging/send-bulk').send({ memberIds: [], body: 'x' }).expect(400);
    await fresh().post('/messaging/send-bulk').send({ memberIds: [m1.id], body: '' }).expect(400);

    // a plain member of the church cannot send at all
    const plain = await signUp(app);
    await ds.query(`UPDATE users SET "churchId" = $1, role = 'member' WHERE id = $2`, [sp.churchId, plain.user.id]);
    await api(app, plain).post('/messaging/send-bulk').send({ memberIds: [m1.id], body: 'x' }).expect(403);
  });
});

describe('Service schedule contract', () => {
  it('accepts { services: [...] } and rejects the old bare-object shape', async () => {
    const sp = await seniorPastor(app);
    await api(app, sp).post('/service-events').send({
      services: [{ name: 'Sunday Service', day: 'Sundays', time: '9:00 AM', location: 'Main Hall', format: 'in-person', kind: 'regular' }],
    }).expect(201);
    const list = (await api(app, sp).get('/service-events').expect(200)).body;
    expect(list).toHaveLength(1);
    await api(app, sp).post('/service-events').send({ name: 'Oops', time: '9' }).expect(400);
  });
});

describe('Church logo upload', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  it('stores a real image, refuses other types', async () => {
    const sp = await seniorPastor(app);
    const ok = await api(app, sp).post('/churches/me/logo').attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' }).expect(201);
    expect(ok.body.logoUrl).toMatch(/\/uploads\/logos\/[0-9a-f-]+\.png$/);
    const me = (await api(app, sp).get('/churches/me').expect(200)).body;
    expect(me.logoUrl).toBe(ok.body.logoUrl);

    await api(app, sp).post('/churches/me/logo').attach('logo', Buffer.from('<script>alert(1)</script>'), { filename: 'x.html', contentType: 'text/html' }).expect(400);
  });
});
