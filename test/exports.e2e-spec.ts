import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
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

const decode = (b64: string) => Buffer.from(b64, 'base64');
const text = (b64: string) => decode(b64).toString('utf-8');
async function sheet(b64: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(decode(b64) as any);
  const ws = wb.worksheets[0];
  const rows: string[][] = [];
  ws.eachRow((row) => rows.push((row.values as any[]).slice(1).map((v) => (v === null || v === undefined ? '' : String(v)))));
  return rows;
}

async function member(sp: Session, firstName: string, phone: string, extra: object = {}) {
  return (await api(app, sp).post('/members').send({ firstName, lastName: 'Test', phone, ...extra }).expect(201)).body;
}

async function branchWithPastor(sp: Senior, phone: string, name = 'North') {
  const branch = (await api(app, sp).post('/churches/branch').send({ name }).expect(201)).body;
  const pastor = (await api(app, sp).post('/members').send({ firstName: 'Paul', lastName: name, phone, churchRole: 'pastor' }).expect(201)).body;
  await api(app, sp).post('/churches/pastors/promote-member').send({ memberId: pastor.id, branchId: branch.id }).expect(201);
  const start = await api(app).post('/auth/login-pastor').send({ phone }).expect(200);
  const login = await api(app).post('/auth/verify-pastor-otp').send({ phone, code: start.body.devCode }).expect(200);
  return { branch, session: { ...login.body, ip: nextIp() } as Session };
}

const exportBody = (over: object = {}) => ({ detail: 'name_number', format: 'xlsx', ...over });

describe('Member export — selection and formats', () => {
  it('numbers-only text file: only the chosen statuses, normalised, one unique number per line', async () => {
    const sp = await seniorPastor(app);
    await member(sp, 'W1', '08031110001', { status: 'worker' });
    await member(sp, 'W2', '+234 803 111 0002', { status: 'worker' });
    await member(sp, 'W3', '08031110002', { status: 'worker' }); // same number as W2, different spelling
    await member(sp, 'F1', '08031110004', { status: 'first_timer' });
    await member(sp, 'M1', '08031110005', { status: 'member' });
    await member(sp, 'D1', '08031110006', { status: 'deceased' });

    const res = (await api(app, sp).post('/members/export').send({ statuses: ['worker'], detail: 'numbers', format: 'txt' }).expect(201)).body;
    expect(res.filename).toMatch(/^members-worker-\d{4}-\d{2}-\d{2}\.txt$/);
    const lines = text(res.base64).trim().split(/\r?\n/);
    expect(lines.sort()).toEqual(['+2348031110001', '+2348031110002']); // W2/W3 deduplicated
    expect(res.count).toBe(2);
  });

  it('Excel: name + number, phone stays text with its plus sign, several statuses combine', async () => {
    const sp = await seniorPastor(app);
    await member(sp, 'Ada', '08031110001', { status: 'worker' });
    await member(sp, 'Bola', '08031110002', { status: 'first_timer' });
    await member(sp, 'Chi', '08031110003', { status: 'member' });

    const res = (await api(app, sp).post('/members/export').send(exportBody({ statuses: ['worker', 'first_timer'] })).expect(201)).body;
    expect(res.mimeType).toContain('spreadsheetml');
    const rows = await sheet(res.base64);
    expect(rows[0]).toEqual(['Name', 'Phone']);
    expect(rows.slice(1)).toEqual([['Ada Test', '+2348031110001'], ['Bola Test', '+2348031110002']]);
  });

  it('full details include branch, department and status', async () => {
    const sp = await seniorPastor(app, { churchName: 'Main Church' });
    await member(sp, 'Ada', '08031110001', { status: 'worker', email: 'ada@x.com', departmentName: 'Ushering', city: 'Ikeja' });
    const rows = await sheet((await api(app, sp).post('/members/export').send(exportBody({ detail: 'full' })).expect(201)).body.base64);
    const h = rows[0];
    const r = rows[1];
    expect(r[h.indexOf('Phone')]).toBe('+2348031110001');
    expect(r[h.indexOf('Email')]).toBe('ada@x.com');
    expect(r[h.indexOf('Department')]).toBe('Ushering');
    expect(r[h.indexOf('Branch')]).toBe('Main Church');
    expect(r[h.indexOf('Status')]).toBe('Worker');
  });

  it('CSV neutralises spreadsheet formulas in names but leaves phone numbers intact', async () => {
    const sp = await seniorPastor(app);
    await member(sp, '=HYPERLINK("http://evil")', '08031110001');
    const csv = text((await api(app, sp).post('/members/export').send(exportBody({ format: 'csv' })).expect(201)).body.base64);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM so Excel reads UTF-8
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"") Test"`); // apostrophe defuses it
    expect(csv).toContain('+2348031110001'); // our own phone format is not mangled
  });

  it('vCard contacts import cleanly', async () => {
    const sp = await seniorPastor(app);
    await member(sp, 'Ada', '08031110001', { status: 'worker' });
    const vcf = text((await api(app, sp).post('/members/export').send({ detail: 'name_number', format: 'vcf', statuses: ['worker'] }).expect(201)).body.base64);
    expect(vcf).toContain('BEGIN:VCARD');
    expect(vcf).toContain('FN:Ada Test');
    expect(vcf).toContain('TEL;TYPE=CELL:+2348031110001');
    expect(vcf).toContain('END:VCARD');
  });

  it('"all" excludes deceased/transferred unless asked for by name; pastors and ministers work as groups', async () => {
    const sp = await seniorPastor(app);
    await member(sp, 'Live', '08031110001', { status: 'member' });
    await member(sp, 'Gone', '08031110002', { status: 'deceased' });
    await member(sp, 'Pas', '08031110003', { churchRole: 'pastor' }); // becomes status pastor
    await member(sp, 'Min', '08031110004', { status: 'minister' });
    const names = async (statuses?: string[]) =>
      (await sheet((await api(app, sp).post('/members/export').send(exportBody({ statuses })).expect(201)).body.base64)).slice(1).map((r) => r[0]);

    expect(await names()).toEqual(expect.arrayContaining(['Live Test', 'Pas Test', 'Min Test']));
    expect(await names()).not.toContain('Gone Test');
    expect(await names(['deceased'])).toEqual(['Gone Test']);
    expect(await names(['pastor'])).toEqual(['Pas Test']);
    expect(await names(['minister'])).toEqual(['Min Test']);
  });

  it('can export only members flagged for follow-up, or only one department', async () => {
    const sp = await seniorPastor(app);
    const a = await member(sp, 'Flagged', '08031110001');
    await member(sp, 'Normal', '08031110002');
    await api(app, sp).post(`/members/${a.id}/follow-up-flag`).send({ flag: true, reason: 'Backsliding' }).expect(201);
    const flagged = (await sheet((await api(app, sp).post('/members/export').send(exportBody({ flaggedOnly: true })).expect(201)).body.base64)).slice(1);
    expect(flagged.map((r) => r[0])).toEqual(['Flagged Test']);

    const cat = (await api(app, sp).post('/group-categories').send({ name: 'Department' }).expect(201)).body;
    const group = (await api(app, sp).post('/ministry-groups').send({ categoryId: cat.id, name: 'Choir' }).expect(201)).body;
    const b = await member(sp, 'Singer', '08031110003');
    await api(app, sp).post(`/ministry-groups/${group.id}/workforce`).send({ memberId: b.id }).expect(201);
    const inGroup = (await sheet((await api(app, sp).post('/members/export').send(exportBody({ groupId: group.id })).expect(201)).body.base64)).slice(1);
    expect(inGroup.map((r) => r[0])).toEqual(['Singer Test']);
  });

  it('previews the count and validates input', async () => {
    const sp = await seniorPastor(app);
    await member(sp, 'W1', '08031110001', { status: 'worker' });
    await member(sp, 'W2', '08031110002', { status: 'worker' });
    expect((await api(app, sp).post('/members/export/count').send({ statuses: ['worker'] }).expect(201)).body).toEqual({ count: 2 });
    await api(app, sp).post('/members/export').send(exportBody({ format: 'pdf' })).expect(400);
    await api(app, sp).post('/members/export').send(exportBody({ statuses: ['nonsense'] })).expect(400);
    await api(app, sp).post('/members/export').send({ format: 'xlsx' }).expect(400); // detail missing
  });
});

describe('Member export — who may export what', () => {
  it('Senior Pastor chooses own church / all branches / one branch; branch pastor can never widen', async () => {
    const sp = await seniorPastor(app);
    const { branch, session: bp } = await branchWithPastor(sp, '08071000001');
    await member(sp, 'Hq', '08031110001');
    await member(bp, 'Br', '08031110002');
    const names = async (s: Session, over: object) =>
      (await sheet((await api(app, s).post('/members/export').send(exportBody(over)).expect(201)).body.base64)).slice(1).map((r) => r[0]);

    expect(await names(sp, {})).toEqual(['Hq Test']); // default: own church
    expect(await names(sp, { branchId: 'all' })).toEqual(expect.arrayContaining(['Hq Test', 'Br Test']));
    expect(await names(sp, { branchId: branch.id })).toEqual(expect.arrayContaining(['Br Test']));
    expect(await names(sp, { branchId: branch.id })).not.toContain('Hq Test');

    // the branch pastor asking for 'all' or for HQ still only gets their own branch
    const own = await names(bp, { branchId: 'all' });
    expect(own).toContain('Br Test');
    expect(own).not.toContain('Hq Test');

    // someone else's branch id is refused
    const other = await seniorPastor(app, { churchName: 'Other' });
    const foreign = (await api(app, other).post('/churches/branch').send({ name: 'Foreign' }).expect(201)).body;
    await api(app, sp).post('/members/export').send(exportBody({ branchId: foreign.id })).expect(400);
  });

  it('is pastors-only and requires login', async () => {
    const sp = await seniorPastor(app);
    await api(app).post('/members/export').send(exportBody()).expect(401);
    const usher = await signUp(app);
    await ds.query(`UPDATE users SET "churchId" = $1, role = 'usher' WHERE id = $2`, [sp.churchId, usher.user.id]);
    await api(app, usher).post('/members/export').send(exportBody()).expect(403);
    await api(app, usher).post('/members/export/count').send({}).expect(403);
    const finance = await signUp(app);
    await ds.query(`UPDATE users SET "churchId" = $1, role = 'finance_officer' WHERE id = $2`, [sp.churchId, finance.user.id]);
    await api(app, finance).post('/members/export').send(exportBody()).expect(403);
  });

  it('every export is written to the audit log (without the data itself)', async () => {
    const sp = await seniorPastor(app);
    await member(sp, 'W1', '08031110001', { status: 'worker' });
    await api(app, sp).post('/members/export').send({ statuses: ['worker'], detail: 'numbers', format: 'csv' }).expect(201);
    const rows = await ds.query(`SELECT kind, format, "rowCount", "userId", details FROM export_logs`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'members', format: 'csv', rowCount: 1, userId: sp.user.id });
    expect(rows[0].details.statuses).toEqual(['worker']);
    expect(JSON.stringify(rows[0])).not.toContain('8031110001');
  });
});
