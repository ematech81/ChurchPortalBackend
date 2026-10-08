import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createApp, resetDb, api, seniorPastor, Session } from './helpers/app';

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

async function member(sp: Session, firstName: string, phone: string, extra: object = {}) {
  return (await api(app, sp).post('/members').send({ firstName, lastName: 'Test', phone, ...extra }).expect(201)).body;
}

describe('Youth platform', () => {
  it('isYouth defaults to false, can be set at registration and edited; youths stay in the main list', async () => {
    const sp = await seniorPastor(app);
    const a = await member(sp, 'Ada', '08031110001');
    const b = await member(sp, 'Bayo', '08031110002', { isYouth: true });
    expect(a.isYouth).toBe(false);
    expect(b.isYouth).toBe(true);

    const all = (await api(app, sp).get('/members').expect(200)).body;
    expect(all).toHaveLength(2);

    const youth = (await api(app, sp).get('/members').query({ youth: 'true' }).expect(200)).body;
    expect(youth.map((m: any) => m.firstName)).toEqual(['Bayo']);
    expect(Number((await api(app, sp).get('/members/count').query({ youth: 'true' }).expect(200)).text)).toBe(1);

    await api(app, sp).patch(`/members/${a.id}`).send({ isYouth: true }).expect(200);
    expect(Number((await api(app, sp).get('/members/count').query({ youth: 'true' }).expect(200)).text)).toBe(2);
    // search still works inside the youth list
    const found = (await api(app, sp).get('/members').query({ youth: 'true', search: 'bay' }).expect(200)).body;
    expect(found.map((m: any) => m.firstName)).toEqual(['Bayo']);
  });

  it('summary counts totals, gender, flagged and upcoming birthdays by month/day (year ignored)', async () => {
    const sp = await seniorPastor(app);
    const soon = new Date(Date.now() + 3 * 86400000);
    const far = new Date(Date.now() + 100 * 86400000);
    await member(sp, 'Soon', '08031110001', { isYouth: true, gender: 'female', dateOfBirth: new Date(2000, soon.getMonth(), soon.getDate(), 12).toISOString() });
    await member(sp, 'Far', '08031110002', { isYouth: true, gender: 'male', dateOfBirth: new Date(1990, far.getMonth(), far.getDate(), 12).toISOString() });
    await member(sp, 'NoDob', '08031110003', { isYouth: true });
    await member(sp, 'Elder', '08031110004', { dateOfBirth: new Date(1970, soon.getMonth(), soon.getDate(), 12).toISOString() });

    const s = (await api(app, sp).get('/members/youth/summary').expect(200)).body;
    expect(s.total).toBe(3);
    expect(s.female).toBe(1);
    expect(s.male).toBe(1);
    expect(s.newThisMonth).toBe(3);
    expect(s.upcomingBirthdays.map((b: any) => b.firstName)).toEqual(['Soon']);
    expect(s.upcomingBirthdays[0].inDays).toBeGreaterThanOrEqual(2);
    expect(s.upcomingBirthdays[0].inDays).toBeLessThanOrEqual(4);
  });

  it('bulk mark/unmark updates only the caller\'s own church members', async () => {
    const sp = await seniorPastor(app);
    const other = await seniorPastor(app, { phone: '08099990001', churchName: 'Other Church' });
    const mine = await member(sp, 'Mine', '08031110001');
    const theirs = await member(other, 'Theirs', '08031110002');

    const r = (await api(app, sp).post('/members/youth/bulk').send({ memberIds: [mine.id, theirs.id], isYouth: true }).expect(201)).body;
    expect(r.updated).toBe(1);
    expect((await api(app, sp).get(`/members/${mine.id}`).expect(200)).body.isYouth).toBe(true);
    expect((await api(app, other).get(`/members/${theirs.id}`).expect(200)).body.isYouth).toBe(false);

    await api(app, sp).post('/members/youth/bulk').send({ memberIds: [mine.id], isYouth: false }).expect(201);
    expect((await api(app, sp).get(`/members/${mine.id}`).expect(200)).body.isYouth).toBe(false);
    await api(app, sp).post('/members/youth/bulk').send({ memberIds: [], isYouth: true }).expect(400);
  });

  it('export can be limited to youth', async () => {
    const sp = await seniorPastor(app);
    await member(sp, 'Y1', '08031110001', { isYouth: true });
    await member(sp, 'Adult', '08031110002');
    const body = { detail: 'name_number', format: 'txt' };
    const count = (await api(app, sp).post('/members/export/count').send({ youthOnly: true }).expect(201)).body;
    expect(count.count ?? count).toBe(1);
    const file = (await api(app, sp).post('/members/export').send({ ...body, youthOnly: true }).expect(201)).body;
    const txt = Buffer.from(file.base64, 'base64').toString('utf-8');
    expect(txt).toContain('Y1');
    expect(txt).not.toContain('Adult');
  });
});
