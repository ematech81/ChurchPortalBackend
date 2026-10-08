import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createApp, resetDb, api, seniorPastor, nextIp, Session } from './helpers/app';

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

const mk = async (sp: Session, firstName: string, phone: string, extra: object = {}) =>
  (await api(app, sp).post('/members').send({ firstName, lastName: 'T', phone, ...extra }).expect(201)).body;
// the bulk endpoint allows ~1 call/second per client, so every call uses a fresh IP
const fresh = (sp: Session) => api(app, { accessToken: sp.accessToken, ip: nextIp() });

describe('Bulk SMS audience', () => {
  // BulkSMS is not configured under test, so sends "fail" at the gateway — but each attempt is still
  // written to message_logs first, which is what these tests inspect (no real SMS is ever sent).
  it('whole-organisation send reaches branch members; own-church send does not', async () => {
    const sp = await seniorPastor(app);
    const branch = (await api(app, sp).post('/churches/branch').send({ name: 'North' }).expect(201)).body;
    const home = await mk(sp, 'Home', '08031110001');
    const away = await mk(sp, 'Away', '08031110002');
    await ds.query(`UPDATE members SET "churchId" = $1 WHERE id = $2`, [branch.id, away.id]);

    const own = (await fresh(sp).post('/messaging/send-bulk').send({ status: 'all', body: 'Hi' }).expect(201)).body;
    expect(own.failed + own.sent).toBe(1);

    await ds.query(`DELETE FROM message_logs`);
    const org = (await fresh(sp).post('/messaging/send-bulk').send({ status: 'all', wholeOrg: true, body: 'Hi' }).expect(201)).body;
    expect(org.failed + org.sent).toBe(2);
    const logs = await ds.query(`SELECT "recipientPhone" FROM message_logs ORDER BY "recipientPhone"`);
    expect(logs.map((l: any) => l.recipientPhone)).toEqual(['08031110001', '08031110002']);
    expect(home.id).toBeDefined();
  });

  it('texts a shared number once, personalises {name}, and honours status and youth filters', async () => {
    const sp = await seniorPastor(app);
    await mk(sp, 'Ada', '08031110001', { status: 'worker', isYouth: true });
    await mk(sp, 'Adaeze', '+2348031110001', { status: 'worker' }); // same number, different format
    await mk(sp, 'Bola', '08031110003', { status: 'member' });

    const r = (await fresh(sp).post('/messaging/send-bulk').send({ status: 'all', body: 'Dear {name}, welcome' }).expect(201)).body;
    expect(r.failed + r.sent).toBe(2); // Ada + Bola; the duplicate number is skipped
    expect(r.skipped).toBe(1);
    const bodies = (await ds.query(`SELECT body FROM message_logs ORDER BY body`)).map((l: any) => l.body);
    expect(bodies).toEqual(['Dear Ada, welcome', 'Dear Bola, welcome']);

    await ds.query(`DELETE FROM message_logs`);
    const youth = (await fresh(sp).post('/messaging/send-bulk').send({ youthOnly: true, body: 'Youth night' }).expect(201)).body;
    expect(youth.failed + youth.sent).toBe(1);
    await ds.query(`DELETE FROM message_logs`);
    const workers = (await fresh(sp).post('/messaging/send-bulk').send({ status: 'worker', body: 'Workers meeting' }).expect(201)).body;
    expect(workers.failed + workers.sent).toBe(1);
  });
});
