import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { createApp, resetDb, api, seniorPastor, signUp, nextIp, Session } from './helpers/app';

let app: INestApplication;
let ds: DataSource;

beforeAll(async () => {
  process.env.PUBLIC_WEB_URL = 'https://portal.test';
  ({ app, ds } = await createApp());
});
beforeEach(async () => {
  await resetDb(ds);
});
afterAll(async () => {
  await app.close();
});

type Senior = Session & { churchId: string };

const FIELDS = [
  { type: 'short_text', label: 'Church / Branch', required: true },
  { type: 'email', label: 'Email', required: false },
  { type: 'dropdown', label: 'Age group', required: true, options: ['Teen', 'Youth', 'Adult'] },
  { type: 'checkbox', label: 'Days attending', required: false, options: ['Friday', 'Saturday', 'Sunday'] },
  { type: 'yes_no', label: 'Need accommodation?', required: false },
];

async function newEvent(sp: Session, over: object = {}) {
  return (await api(app, sp).post('/event-forms').send({ title: 'Redeemed Crusade 2026', venue: 'Ikeja Arena', fields: FIELDS, ...over }).expect(201)).body;
}
const fid = (ev: any, label: string) => ev.fields.find((f: any) => f.label === label).id;
const decode = (b64: string) => Buffer.from(b64, 'base64');

/** Anonymous visitor: every call gets its own IP, like real people on different phones. */
const visitor = () => api(app);
// NOT async: it must return the supertest request itself so callers can chain .expect(...)
function register(slug: string, ev: any, over: any = {}) {
  return visitor().post(`/public/events/${slug}/register`).send({
    fullName: 'Ada Obi',
    phone: '08031112222',
    answers: { [fid(ev, 'Church / Branch')]: 'Ikeja', [fid(ev, 'Age group')]: 'Adult' },
    ...over,
  });
}

async function branchWithPastor(sp: Senior, phone: string, name = 'North') {
  const branch = (await api(app, sp).post('/churches/branch').send({ name }).expect(201)).body;
  const pastor = (await api(app, sp).post('/members').send({ firstName: 'Paul', lastName: name, phone, churchRole: 'pastor' }).expect(201)).body;
  await api(app, sp).post('/churches/pastors/promote-member').send({ memberId: pastor.id, branchId: branch.id }).expect(201);
  const start = await api(app).post('/auth/login-pastor').send({ phone }).expect(200);
  const login = await api(app).post('/auth/verify-pastor-otp').send({ phone, code: start.body.devCode }).expect(200);
  return { branch, session: { ...login.body, ip: nextIp() } as Session };
}

describe('Creating an event and its shareable link', () => {
  it('gives every event a unique link built from the public web address', async () => {
    const sp = await seniorPastor(app);
    const a = await newEvent(sp);
    const b = await newEvent(sp);
    expect(a.slug).toMatch(/^redeemed-crusade-2026-[a-z0-9]{5}$/);
    expect(a.slug).not.toBe(b.slug);
    expect(a.shareUrl).toBe(`https://portal.test/e/${a.slug}`);
    expect(a.status).toBe('open');
    expect(a.fields).toHaveLength(5);
    expect(a.fields.every((f: any) => /^[A-Za-z0-9_-]+$/.test(f.id))).toBe(true);
  });

  it('rejects unusable forms with a clear message', async () => {
    const sp = await seniorPastor(app);
    await api(app, sp).post('/event-forms').send({ title: 'x', fields: [] }).expect(400); // title too short
    await api(app, sp).post('/event-forms').send({ title: 'Valid title', fields: [{ type: 'dropdown', label: 'Pick', options: [] }] }).expect(400);
    await api(app, sp).post('/event-forms').send({ title: 'Valid title', fields: [{ type: 'magic', label: 'Q' }] }).expect(400);
    await api(app, sp).post('/event-forms').send({ title: 'Valid title', fields: [{ type: 'short_text', label: '   ' }] }).expect(400);
    await api(app, sp).post('/event-forms').send({ title: 'Valid title', fields: [], extra: 1 }).expect(400);
  });
});

describe('The public page', () => {
  it('shows the form to anyone without exposing any registrations', async () => {
    const sp = await seniorPastor(app, { churchName: 'Sovereign Word Church' });
    const ev = await newEvent(sp, { capacity: 100 });
    await register(ev.slug, ev).expect(201);

    const pub = (await visitor().get(`/public/events/${ev.slug}`).expect(200)).body;
    expect(pub).toMatchObject({ title: 'Redeemed Crusade 2026', churchName: 'Sovereign Word Church', status: 'open', spotsLeft: 99 });
    expect(pub.fields).toHaveLength(5);
    const json = JSON.stringify(pub);
    expect(json).not.toContain('Ada Obi');
    expect(json).not.toContain('2348031112222');
    expect(pub).not.toHaveProperty('registrations');
    await visitor().get('/public/events/does-not-exist-abcde').expect(404);
  });

  it('registers someone, normalises the phone, returns a ticket code, stores the answers', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp, { confirmationMessage: 'See you there!' });
    const res = await register(ev.slug, ev, {
      answers: {
        [fid(ev, 'Church / Branch')]: ' Ikeja ',
        [fid(ev, 'Email')]: 'ADA@Example.com',
        [fid(ev, 'Age group')]: 'Youth',
        [fid(ev, 'Days attending')]: ['Friday', 'Sunday', 'Friday'],
        [fid(ev, 'Need accommodation?')]: 'YES',
        'made-up-field': 'ignored',
      },
    }).expect(201);
    expect(res.body.message).toBe('See you there!');
    expect(res.body.ticketCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

    const stored = (await ds.query(`SELECT "fullName", phone, answers FROM event_registrations`))[0];
    expect(stored.phone).toBe('+2348031112222');
    expect(stored.answers[fid(ev, 'Email')]).toBe('ada@example.com');
    expect(stored.answers[fid(ev, 'Days attending')]).toEqual(['Friday', 'Sunday']);
    expect(stored.answers[fid(ev, 'Need accommodation?')]).toBe('yes');
    expect(stored.answers['made-up-field']).toBeUndefined();
  });

  it('lists every problem at once when the form is wrong', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp);
    const bad = await register(ev.slug, ev, {
      phone: '08031112222',
      answers: { [fid(ev, 'Email')]: 'not-an-email', [fid(ev, 'Age group')]: 'Elder' },
    }).expect(400);
    expect(bad.body.code).toBe('INVALID_ANSWERS');
    expect(bad.body.message).toEqual(expect.arrayContaining([
      '"Church / Branch" is required.',
      '"Email" must be a valid email address.',
      '"Age group": choose one of the listed options.',
    ]));
    await register(ev.slug, ev, { phone: 'abc' }).expect(400);
    await register(ev.slug, ev, { fullName: 'A' }).expect(400);
    expect(await ds.query(`SELECT count(*)::int AS n FROM event_registrations`)).toEqual([{ n: 0 }]);
  });

  it('allows one registration per phone number, however it is typed', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp);
    await register(ev.slug, ev, { phone: '08031112222' }).expect(201);
    const dup = await register(ev.slug, ev, { phone: '+234 803 111 2222', fullName: 'Someone Else' }).expect(409);
    expect(dup.body.code).toBe('ALREADY_REGISTERED');
    expect(JSON.stringify(dup.body)).not.toMatch(/ticket/i); // never leaks the earlier ticket code
    await register(ev.slug, ev, { phone: '08031112223' }).expect(201); // a different person is fine
  });

  it('lets families share a phone when the event allows duplicates', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp, { uniquePhone: false });
    await register(ev.slug, ev, { fullName: 'Parent One' }).expect(201);
    await register(ev.slug, ev, { fullName: 'Child Two' }).expect(201);
    expect(await ds.query(`SELECT count(*)::int AS n FROM event_registrations`)).toEqual([{ n: 2 }]);
  });

  it('never overshoots capacity, even when many people register at the same instant', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp, { capacity: 3 });
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => register(ev.slug, ev, { phone: `0803111000${i}`, fullName: `Person ${i}` })),
    );
    const ok = results.filter((r) => r.status === 201).length;
    const full = results.filter((r) => r.status === 409 && r.body.code === 'EVENT_FULL').length;
    expect(ok).toBe(3);
    expect(full).toBe(7);
    expect(await ds.query(`SELECT count(*)::int AS n FROM event_registrations`)).toEqual([{ n: 3 }]);
    expect((await visitor().get(`/public/events/${ev.slug}`).expect(200)).body).toMatchObject({ status: 'full', spotsLeft: 0 });
  });

  it('does not let the same phone slip in twice under a simultaneous double-tap', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp);
    const results = await Promise.all(Array.from({ length: 6 }, () => register(ev.slug, ev)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await ds.query(`SELECT count(*)::int AS n FROM event_registrations`)).toEqual([{ n: 1 }]);
  });

  it('closes by switch or by deadline, and can be reopened', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp);
    await api(app, sp).patch(`/event-forms/${ev.id}`).send({ isOpen: false }).expect(200);
    const closed = await register(ev.slug, ev).expect(403);
    expect(closed.body.code).toBe('REGISTRATION_CLOSED');
    expect((await visitor().get(`/public/events/${ev.slug}`).expect(200)).body.status).toBe('closed');

    await api(app, sp).patch(`/event-forms/${ev.id}`).send({ isOpen: true }).expect(200);
    await register(ev.slug, ev).expect(201);

    await api(app, sp).patch(`/event-forms/${ev.id}`).send({ registrationClosesAt: new Date(Date.now() - 60_000).toISOString() }).expect(200);
    await register(ev.slug, ev, { phone: '08039998888' }).expect(403);
  });

  it('silently discards bot submissions that fill the hidden honeypot field', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp);
    const res = await register(ev.slug, ev, { website: 'http://spam.example' }).expect(201);
    expect(res.body.ok).toBe(true); // looks like success to the bot
    expect(await ds.query(`SELECT count(*)::int AS n FROM event_registrations`)).toEqual([{ n: 0 }]);
  });

  it('rate-limits a flood from one address but not other people', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp, { uniquePhone: false });
    const flood = api(app); // one IP
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await flood.post(`/public/events/${ev.slug}/register`).send({ fullName: 'Bot', phone: '08031112222', answers: {} })).status);
    }
    expect(statuses).toContain(429);
    await register(ev.slug, ev, { phone: '08035550000' }).expect(201); // someone on another connection is fine
  });
});

describe('Managing events and responses (pastors)', () => {
  it('lists recent events with counts, searches by title, and shows one event in detail', async () => {
    const sp = await seniorPastor(app);
    const a = await newEvent(sp, { title: 'Youth Conference' });
    await newEvent(sp, { title: 'Easter Crusade' });
    await register(a.slug, a, { phone: '08030000001' }).expect(201);
    await register(a.slug, a, { phone: '08030000002' }).expect(201);

    const all = (await api(app, sp).get('/event-forms').expect(200)).body;
    expect(all.map((e: any) => e.title)).toEqual(['Easter Crusade', 'Youth Conference']); // newest first
    expect(all.find((e: any) => e.title === 'Youth Conference').registrationCount).toBe(2);

    const found = (await api(app, sp).get('/event-forms?search=youth').expect(200)).body;
    expect(found.map((e: any) => e.title)).toEqual(['Youth Conference']);
    expect((await api(app, sp).get('/event-forms?search=100%25').expect(200)).body).toEqual([]); // % is literal

    const detail = (await api(app, sp).get(`/event-forms/${a.id}`).expect(200)).body;
    expect(detail.registrationCount).toBe(2);
    expect(detail.fields).toHaveLength(5);
  });

  it('shows responses with search and paging, and removing one frees the phone number', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp);
    for (let i = 1; i <= 5; i++) await register(ev.slug, ev, { phone: `0803000000${i}`, fullName: i === 3 ? 'Chidi Okafor' : `Person ${i}` }).expect(201);

    const page1 = (await api(app, sp).get(`/event-forms/${ev.id}/registrations?limit=2`).expect(200)).body;
    expect(page1).toMatchObject({ total: 5, page: 1, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0].fullName).toBe('Person 5'); // newest first

    const search = (await api(app, sp).get(`/event-forms/${ev.id}/registrations?search=chidi`).expect(200)).body;
    expect(search.items.map((r: any) => r.fullName)).toEqual(['Chidi Okafor']);
    const byPhone = (await api(app, sp).get(`/event-forms/${ev.id}/registrations?search=08030000004`).expect(200)).body;
    expect(byPhone.total).toBe(0); // stored as +234…, search matches the stored form
    expect((await api(app, sp).get(`/event-forms/${ev.id}/registrations?search=8030000004`).expect(200)).body.total).toBe(1);

    await api(app, sp).delete(`/event-forms/${ev.id}/registrations/${search.items[0].id}`).expect(204);
    await register(ev.slug, ev, { phone: '08030000003' }).expect(201); // can register again
  });

  it('protects question answers once people have registered', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp);
    await register(ev.slug, ev).expect(201);

    // removing or retyping an answered question is refused
    await api(app, sp).patch(`/event-forms/${ev.id}`).send({ fields: ev.fields.slice(1) }).expect(400);
    await api(app, sp).patch(`/event-forms/${ev.id}`).send({ fields: ev.fields.map((f: any, i: number) => (i === 0 ? { ...f, type: 'number' } : f)) }).expect(400);

    // renaming, new options and new questions are fine, and ids are kept
    const edited = (await api(app, sp).patch(`/event-forms/${ev.id}`).send({
      title: 'Renamed Crusade',
      fields: [
        ...ev.fields.map((f: any, i: number) => (i === 0 ? { ...f, label: 'Your church' } : f)),
        { type: 'long_text', label: 'Prayer request', required: false },
      ],
    }).expect(200)).body;
    expect(edited.title).toBe('Renamed Crusade');
    expect(edited.fields[0].id).toBe(ev.fields[0].id);
    expect(edited.fields[0].label).toBe('Your church');
    expect(edited.fields).toHaveLength(6);
    expect(edited.slug).toBe(ev.slug); // the shared link never changes
  });

  it('exports to Excel and CSV with one column per question, in readable form', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp);
    await register(ev.slug, ev, {
      fullName: 'Ada Obi',
      answers: {
        [fid(ev, 'Church / Branch')]: '=SUM(1+1)', // hostile cell content
        [fid(ev, 'Age group')]: 'Adult',
        [fid(ev, 'Days attending')]: ['Friday', 'Sunday'],
        [fid(ev, 'Need accommodation?')]: 'yes',
      },
    }).expect(201);

    const x = (await api(app, sp).post(`/event-forms/${ev.id}/export`).send({ format: 'xlsx' }).expect(201)).body;
    expect(x.filename).toMatch(/^Redeemed-Crusade-2026-registrations-.*\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(decode(x.base64) as any);
    const rows: string[][] = [];
    wb.worksheets[0].eachRow((r) => rows.push((r.values as any[]).slice(1).map((v) => String(v ?? ''))));
    expect(rows[0]).toEqual(['#', 'Registered (WAT)', 'Full name', 'Phone', 'Ticket code', 'Church / Branch', 'Email', 'Age group', 'Days attending', 'Need accommodation?']);
    expect(rows[1][2]).toBe('Ada Obi');
    expect(rows[1][3]).toBe('+2348031112222');
    expect(rows[1][5]).toBe('=SUM(1+1)'); // stored as plain text, never evaluated
    expect(rows[1][8]).toBe('Friday, Sunday');
    expect(rows[1][9]).toBe('Yes');

    const csv = decode((await api(app, sp).post(`/event-forms/${ev.id}/export`).send({ format: 'csv' }).expect(201)).body.base64).toString('utf-8');
    expect(csv).toContain(`'=SUM(1+1)`); // defused for Excel
    expect(csv).toContain('+2348031112222');

    const log = await ds.query(`SELECT kind, format, "rowCount" FROM export_logs ORDER BY "createdAt"`);
    expect(log).toEqual([
      { kind: 'event_registrations', format: 'xlsx', rowCount: 1 },
      { kind: 'event_registrations', format: 'csv', rowCount: 1 },
    ]);
    await api(app, sp).post(`/event-forms/${ev.id}/export`).send({ format: 'pdf' }).expect(400);
  });

  it('a deleted event stops working at once', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp);
    await api(app, sp).delete(`/event-forms/${ev.id}`).expect(204);
    await visitor().get(`/public/events/${ev.slug}`).expect(404);
    await register(ev.slug, ev).expect(404);
    await api(app, sp).get(`/event-forms/${ev.id}`).expect(404);
  });
});

describe('Who can see which events', () => {
  it('Senior Pastor sees every branch; a Branch Pastor only their own; other churches see nothing', async () => {
    const sp = await seniorPastor(app);
    const { session: bp } = await branchWithPastor(sp, '08071000001');
    const hq = await newEvent(sp, { title: 'HQ Event' });
    const br = await newEvent(bp, { title: 'Branch Event' });

    const seniorSees = (await api(app, sp).get('/event-forms').expect(200)).body.map((e: any) => e.title);
    expect(seniorSees).toEqual(expect.arrayContaining(['HQ Event', 'Branch Event']));
    const seniorBranch = (await api(app, sp).get('/event-forms').expect(200)).body.find((e: any) => e.title === 'Branch Event');
    expect(seniorBranch.churchName).toBeTruthy();

    expect((await api(app, bp).get('/event-forms').expect(200)).body.map((e: any) => e.title)).toEqual(['Branch Event']);
    await api(app, bp).get(`/event-forms/${hq.id}`).expect(404);
    await api(app, bp).patch(`/event-forms/${hq.id}`).send({ title: 'Hacked' }).expect(404);
    await api(app, bp).delete(`/event-forms/${hq.id}`).expect(404);
    await api(app, sp).get(`/event-forms/${br.id}`).expect(200); // the senior can open a branch event

    const other = await seniorPastor(app, { churchName: 'Other Church' });
    expect((await api(app, other).get('/event-forms').expect(200)).body).toEqual([]);
    await api(app, other).get(`/event-forms/${hq.id}`).expect(404);
    await api(app, other).get(`/event-forms/${hq.id}/registrations`).expect(404);
    await api(app, other).post(`/event-forms/${hq.id}/export`).send({ format: 'csv' }).expect(404);
  });

  it('only pastors manage events; the public page needs no login', async () => {
    const sp = await seniorPastor(app);
    const ev = await newEvent(sp);
    await api(app).get('/event-forms').expect(401);
    const usher = await signUp(app);
    await ds.query(`UPDATE users SET "churchId" = $1, role = 'usher' WHERE id = $2`, [sp.churchId, usher.user.id]);
    await api(app, usher).get('/event-forms').expect(403);
    await api(app, usher).post('/event-forms').send({ title: 'Nope', fields: [] }).expect(403);
    await visitor().get(`/public/events/${ev.slug}`).expect(200);
  });
});
