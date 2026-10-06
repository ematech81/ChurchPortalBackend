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
  return { branch, session: { ...login.body, ip: nextIp() } as Session };
}

describe('PINs are per account (Senior and Branch Pastor never share one)', () => {
  it('a senior pastor PIN does not unlock a branch pastor, and each has their own', async () => {
    const sp = await seniorPastor(app);
    const { session: bp } = await branchWithPastor(sp, '08075000001');

    await api(app, sp).post('/auth/pin/create').send({ pin: '1234', confirmPin: '1234' }).expect(200);
    // creating a second PIN over the first is refused (use "Forgot PIN")
    await api(app, sp).post('/auth/pin/create').send({ pin: '9999', confirmPin: '9999' }).expect(400);

    // the branch pastor has no PIN of their own yet, so the senior PIN means nothing to them
    expect((await api(app, bp).get('/users/me').expect(200)).body.hasPin).toBe(false);
    await api(app, bp).post('/auth/pin/verify').send({ pin: '1234' }).expect(400);

    await api(app, bp).post('/auth/pin/create').send({ pin: '5678', confirmPin: '5678' }).expect(200);
    await api(app, bp).post('/auth/pin/verify').send({ pin: '1234' }).expect(401); // senior PIN rejected
    await api(app, bp).post('/auth/pin/verify').send({ pin: '5678' }).expect(200);
    await api(app, sp).post('/auth/pin/verify').send({ pin: '5678' }).expect(401); // and vice versa
    await api(app, sp).post('/auth/pin/verify').send({ pin: '1234' }).expect(200);
  });
});

describe('Add to workforce', () => {
  async function aGroup(sp: Senior, name = 'Ushering') {
    // (The seeded global categories are wiped by the per-test reset, so create one.)
    const dept = (await api(app, sp).post('/group-categories').send({ name: 'Department' }).expect(201)).body;
    return (await api(app, sp).post('/ministry-groups').send({ categoryId: dept.id, name }).expect(201)).body;
  }

  it('puts an ordinary member into a department and makes them a worker', async () => {
    const sp = await seniorPastor(app);
    const group = await aGroup(sp);
    const m = (await api(app, sp).post('/members').send({ firstName: 'Ada', lastName: 'Obi', phone: '08076000001', status: 'member' }).expect(201)).body;

    const res = await api(app, sp).post(`/ministry-groups/${group.id}/workforce`).send({ memberId: m.id, roleTitle: 'Usher' }).expect(201);
    expect(res.body.member.status).toBe('worker');
    expect(res.body.member.departmentName).toBe('Ushering');
    expect(res.body.member.departmentRole).toBe('Usher');

    const g = (await api(app, sp).get(`/ministry-groups/${group.id}`).expect(200)).body;
    expect(g.memberships.map((x: any) => x.memberId)).toContain(m.id);
    expect(Number((await api(app, sp).get('/members/count?status=worker').expect(200)).text)).toBe(1);

    // joining the same department twice is refused
    await api(app, sp).post(`/ministry-groups/${group.id}/workforce`).send({ memberId: m.id }).expect(400);
  });

  it('never changes a pastor status, is church-scoped and admin-only', async () => {
    const sp = await seniorPastor(app);
    const other = await seniorPastor(app, { churchName: 'Other' });
    const group = await aGroup(sp);
    const pastor = (await api(app, sp).post('/members').send({ firstName: 'P', lastName: 'P', phone: '08076000002', churchRole: 'pastor' }).expect(201)).body;
    const res = await api(app, sp).post(`/ministry-groups/${group.id}/workforce`).send({ memberId: pastor.id }).expect(201);
    expect(res.body.member.status).toBe('pastor');

    const foreign = (await api(app, other).post('/members').send({ firstName: 'F', lastName: 'F', phone: '08076000003' }).expect(201)).body;
    await api(app, sp).post(`/ministry-groups/${group.id}/workforce`).send({ memberId: foreign.id }).expect(404);
    await api(app, other).post(`/ministry-groups/${group.id}/workforce`).send({ memberId: foreign.id }).expect(404);

    const usher = await signUp(app);
    await ds.query(`UPDATE users SET "churchId" = $1, role = 'usher' WHERE id = $2`, [sp.churchId, usher.user.id]);
    await api(app, usher).post(`/ministry-groups/${group.id}/workforce`).send({ memberId: pastor.id }).expect(403);
  });
});

describe('Flag for follow-up', () => {
  it('flags an existing member into the queue, never a pastor or minister, and graduation clears it', async () => {
    const sp = await seniorPastor(app);
    const m = (await api(app, sp).post('/members').send({ firstName: 'Back', lastName: 'Slider', phone: '08077000001', status: 'member' }).expect(201)).body;

    const flagged = (await api(app, sp).post(`/members/${m.id}/follow-up-flag`).send({ flag: true, reason: 'Backsliding' }).expect(201)).body;
    expect(flagged.tags).toContain('Follow-Up Needed');
    expect(flagged.customFields.followUp.reason).toBe('Backsliding');

    const queue = (await api(app, sp).get('/follow-up/queue').expect(200)).body;
    expect(queue.map((q: any) => q.id)).toContain(m.id);

    const pastor = (await api(app, sp).post('/members').send({ firstName: 'P', lastName: 'P', phone: '08077000002', churchRole: 'pastor' }).expect(201)).body;
    const minister = (await api(app, sp).post('/members').send({ firstName: 'M', lastName: 'M', phone: '08077000003', status: 'minister' }).expect(201)).body;
    await api(app, sp).post(`/members/${pastor.id}/follow-up-flag`).send({ flag: true }).expect(400);
    await api(app, sp).post(`/members/${minister.id}/follow-up-flag`).send({ flag: true }).expect(400);

    // assign a worker and complete the journey: the flag is gone and they do not reappear in the queue
    const w = (await api(app, sp).post('/members').send({ firstName: 'W', lastName: 'W', phone: '08077000004', status: 'worker' }).expect(201)).body;
    const j = (await api(app, sp).post('/follow-up/journeys').send({ memberId: m.id, decisionType: 'follow-up', assignedWorkerId: w.id }).expect(201)).body.journey;
    await api(app, sp).patch(`/follow-up/journeys/${j.id}/status`).send({ status: 'completed' }).expect(200);
    const after = (await api(app, sp).get(`/members/${m.id}`).expect(200)).body;
    expect(after.tags).not.toContain('Follow-Up Needed');
    expect((await api(app, sp).get('/follow-up/queue').expect(200)).body.map((q: any) => q.id)).not.toContain(m.id);

    // manual un-flag works too
    await api(app, sp).post(`/members/${m.id}/follow-up-flag`).send({ flag: true }).expect(201);
    const cleared = (await api(app, sp).post(`/members/${m.id}/follow-up-flag`).send({ flag: false }).expect(201)).body;
    expect(cleared.tags).not.toContain('Follow-Up Needed');
    expect(cleared.customFields.followUp).toBeUndefined();
  });

  it('is scoped: a branch pastor cannot flag HQ members, a plain member cannot flag anyone', async () => {
    const sp = await seniorPastor(app);
    const { session: bp } = await branchWithPastor(sp, '08077000010');
    const hq = (await api(app, sp).post('/members').send({ firstName: 'Hq', lastName: 'M', phone: '08077000011' }).expect(201)).body;
    await api(app, bp).post(`/members/${hq.id}/follow-up-flag`).send({ flag: true }).expect(404);

    const plain = await signUp(app);
    await ds.query(`UPDATE users SET "churchId" = $1, role = 'member' WHERE id = $2`, [sp.churchId, plain.user.id]);
    await api(app, plain).post(`/members/${hq.id}/follow-up-flag`).send({ flag: true }).expect(403);
  });
});
