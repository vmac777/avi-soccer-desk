import { format } from 'date-fns';

/**
 * Calendar days, as the database stores them.
 *
 * `follow_ups.due_date` and `contacts.last_contact` are Postgres `date`
 * columns: a bare `YYYY-MM-DD` with no time and no zone. They mean a day on a
 * wall calendar, not an instant. Two conversions have to agree with that, and
 * neither of the obvious one-liners does.
 *
 * `new Date().toISOString().slice(0, 10)` is the **UTC** day. In São Paulo
 * (UTC-3) everything after 21:00 belongs to tomorrow, so between 21:00 and
 * midnight the sidebar badge counted tomorrow's reminders as due, a calendar
 * would ring today's square on the wrong day, and one-tap "log touch" stamped
 * `last_contact` a day in the future — which then read as staleness of -1.
 *
 * `new Date('2026-08-21')` is the mirror image: parsed as UTC midnight, which
 * is the evening of the 20th locally, so a reminder rendered one square early.
 *
 * Both helpers work in local time, which is the agent's time, which is the only
 * clock a football calendar cares about.
 */

/** How a calendar day is spelled in the database. */
export const DATE_KEY_FORMAT = 'yyyy-MM-dd';

/** Today, on the wall calendar in front of the person using the app. */
export const todayKey = (): string => format(new Date(), DATE_KEY_FORMAT);

/** Read a stored `YYYY-MM-DD` back as local midnight. */
export const parseDateKey = (key: string): Date => new Date(key + 'T00:00:00');

/** Write a Date back out as a stored `YYYY-MM-DD`. */
export const toDateKey = (date: Date): string => format(date, DATE_KEY_FORMAT);
