import { randomInt } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { CHOICE_TYPES, FIELD_TYPES, FormField } from './event-form.entity';
import { phoneDigitVariants, toE164 } from '../../common/utils/phone';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// No 0/O/1/I/L: tickets get read out loud and typed from screenshots.
const TICKET_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newFieldId(): string {
  let s = 'f_';
  for (let i = 0; i < 6; i++) s += ID_CHARS[randomInt(ID_CHARS.length)];
  return s;
}

export function newTicketCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += TICKET_CHARS[randomInt(TICKET_CHARS.length)];
    if (/[A-Z]/.test(c) && /[2-9]/.test(c)) return c;
  }
}

/**
 * Cleans a field list coming from the form builder: stable unique ids, trimmed labels, valid
 * options only on choice questions. Throws 400 with a readable message on anything unusable.
 */
export function normalizeFields(input: Partial<FormField>[]): FormField[] {
  const seen = new Set<string>();
  return input.map((raw, i) => {
    const n = i + 1;
    if (!raw.type || !FIELD_TYPES.includes(raw.type)) throw new BadRequestException(`Question ${n}: unknown type.`);
    const label = (raw.label ?? '').trim();
    if (!label) throw new BadRequestException(`Question ${n}: the question text is required.`);

    let id = raw.id && /^[A-Za-z0-9_-]{1,40}$/.test(raw.id) ? raw.id : newFieldId();
    while (seen.has(id)) id = newFieldId();
    seen.add(id);

    const field: FormField = { id, type: raw.type, label: label.slice(0, 200), required: !!raw.required };
    if (raw.helpText?.trim()) field.helpText = raw.helpText.trim().slice(0, 300);

    if (CHOICE_TYPES.includes(raw.type)) {
      const options = [...new Set((raw.options ?? []).map((o) => String(o).trim()).filter(Boolean))].slice(0, 50);
      if (options.length < 1) throw new BadRequestException(`Question ${n} ("${label}"): add at least one option.`);
      field.options = options.map((o) => o.slice(0, 100));
    }
    return field;
  });
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/**
 * Validates a public submission against the form definition. Returns the cleaned answers keyed by
 * field id (unknown keys are dropped) or throws a 400 listing EVERY problem at once, so the person
 * filling the form can fix them in one go.
 */
export function validateAnswers(fields: FormField[], answers: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const clean: Record<string, unknown> = {};
  const src = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};

  for (const f of fields) {
    const v = src[f.id];
    if (isEmpty(v)) {
      if (f.required) errors.push(`"${f.label}" is required.`);
      continue;
    }
    switch (f.type) {
      case 'short_text':
      case 'long_text': {
        const max = f.type === 'short_text' ? 500 : 3000;
        const s = String(v).trim();
        if (s.length > max) errors.push(`"${f.label}" is too long (max ${max} characters).`);
        else clean[f.id] = s;
        break;
      }
      case 'phone':
        if (!phoneDigitVariants(String(v)).length) errors.push(`"${f.label}" must be a valid phone number.`);
        else clean[f.id] = toE164(String(v));
        break;
      case 'email': {
        const s = String(v).trim();
        if (s.length > 254 || !EMAIL_RE.test(s)) errors.push(`"${f.label}" must be a valid email address.`);
        else clean[f.id] = s.toLowerCase();
        break;
      }
      case 'number': {
        const num = typeof v === 'number' ? v : Number(String(v).trim());
        if (!Number.isFinite(num) || Math.abs(num) > 1e12) errors.push(`"${f.label}" must be a number.`);
        else clean[f.id] = num;
        break;
      }
      case 'dropdown':
      case 'radio': {
        const s = String(v);
        if (!f.options?.includes(s)) errors.push(`"${f.label}": choose one of the listed options.`);
        else clean[f.id] = s;
        break;
      }
      case 'checkbox': {
        const arr = Array.isArray(v) ? v.map(String) : [String(v)];
        const uniq = [...new Set(arr)];
        if (uniq.some((o) => !f.options?.includes(o))) errors.push(`"${f.label}": choose only from the listed options.`);
        else clean[f.id] = uniq;
        break;
      }
      case 'date': {
        const s = String(v).trim();
        const ok = /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);
        if (!ok) errors.push(`"${f.label}" must be a valid date.`);
        else clean[f.id] = s;
        break;
      }
      case 'yes_no': {
        const s = String(v).toLowerCase();
        if (s !== 'yes' && s !== 'no') errors.push(`"${f.label}": choose Yes or No.`);
        else clean[f.id] = s;
        break;
      }
    }
  }

  if (errors.length) throw new BadRequestException({ message: errors, code: 'INVALID_ANSWERS' });
  return clean;
}

/** How an answer reads in a spreadsheet cell. */
export function answerToText(f: FormField, v: unknown): string {
  if (isEmpty(v)) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (f.type === 'yes_no') return v === 'yes' ? 'Yes' : 'No';
  return String(v);
}
