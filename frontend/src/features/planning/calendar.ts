import type { PlannedSession } from './types';

/**
 * The month grid, and the arithmetic that keeps it honest about time zones.
 *
 * Kept apart from React because every bug a calendar has is a date bug, and a
 * date bug you can only reproduce by clicking a cell is a date bug you will
 * ship. Everything here is a pure function of its arguments.
 */

export const DAYS_IN_WEEK = 7;

/** Six rows always. A five-row month next to a six-row one makes the whole
 *  page jump when you page through it, and the grid is the page. */
export const WEEKS_IN_GRID = 6;

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface CalendarDay {
  date: Date;
  /** Local `YYYY-MM-DD`. The key everything else joins on. */
  key: string;
  /** False for the leading and trailing days borrowed from the neighbours. */
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
}

/**
 * Local `YYYY-MM-DD` for a date.
 *
 * Built by hand instead of `toISOString().slice(0, 10)`, and this is the single
 * most important line in the file. `toISOString` converts to UTC first: for
 * anyone west of Greenwich, a block at 8pm on the 3rd becomes the 4th, and it
 * silently lands in the wrong cell of the calendar. The bug only shows up for
 * evening sessions, only in some time zones, and never on the machine of
 * whoever wrote it.
 */
export const dateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Midnight, local time, of the day the given date falls on. */
export const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const addMonths = (date: Date, months: number): Date =>
  // Day 1 first: `setMonth` on the 31st of a 30-day target month rolls into the
  // next one, so paging from March 31st would skip April entirely.
  new Date(date.getFullYear(), date.getMonth() + months, 1);

/**
 * How many days back the grid starts, with weeks running Monday to Sunday.
 *
 * `getDay()` is 0 for Sunday, so Sunday needs six days of lead-in and not zero.
 */
const leadingDays = (firstOfMonth: Date): number => (firstOfMonth.getDay() + 6) % DAYS_IN_WEEK;

/**
 * The 42 cells of a month view, including the neighbouring days that fill the
 * first and last rows.
 *
 * `today` is a parameter rather than `new Date()` so the grid can be tested
 * without freezing the clock.
 */
export const buildMonthGrid = (month: Date, today: Date = new Date()): CalendarDay[] => {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = addDays(firstOfMonth, -leadingDays(firstOfMonth));

  const todayKey = dateKey(today);
  const todayStart = startOfDay(today).getTime();

  return Array.from({ length: WEEKS_IN_GRID * DAYS_IN_WEEK }, (_, offset) => {
    const date = addDays(gridStart, offset);
    return {
      date,
      key: dateKey(date),
      inMonth: date.getMonth() === month.getMonth(),
      isToday: dateKey(date) === todayKey,
      // By day, not by instant: the morning of today is not "past" for someone
      // planning an afternoon block.
      isPast: date.getTime() < todayStart,
    };
  });
};

/**
 * The instants the grid spans, for the server query.
 *
 * The whole grid and not just the month: the first and last rows show days from
 * the neighbouring months, and leaving them out would draw those cells empty
 * even when something is planned in them.
 */
export const gridRange = (month: Date, today?: Date): { from: string; to: string } => {
  const grid = buildMonthGrid(month, today);
  const first = grid[0].date;
  const last = grid[grid.length - 1].date;
  return {
    from: startOfDay(first).toISOString(),
    // Exclusive upper bound at the start of the day after the last cell, so a
    // block planned at 11pm on that day is still inside the range.
    to: addDays(startOfDay(last), 1).toISOString(),
  };
};

/** Sessions bucketed by the local day they start on, each bucket in time order. */
export const groupByDay = (sessions: PlannedSession[]): Map<string, PlannedSession[]> => {
  const byDay = new Map<string, PlannedSession[]>();

  for (const session of sessions) {
    const key = dateKey(new Date(session.starts_at));
    const bucket = byDay.get(key);
    if (bucket) bucket.push(session);
    else byDay.set(key, [session]);
  }

  for (const bucket of byDay.values()) {
    bucket.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  return byDay;
};

/**
 * A local date plus an `HH:mm` string, as an absolute instant.
 *
 * The Date constructor takes local components, so the conversion to UTC happens
 * once, at the boundary, and with the browser's own rules — including whichever
 * side of a DST change the day falls on.
 */
export const combineDateAndTime = (day: Date, time: string): Date => {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
};

/** `HH:mm` in local time, for a time input. */
export const timeValue = (date: Date): string =>
  `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;

/** `HH:mm` plus a number of minutes, rolling over midnight. */
export const addMinutesToTime = (time: string, minutes: number): string => {
  const [hours, mins] = time.split(':').map(Number);
  const total = ((hours * 60 + mins + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${`${Math.floor(total / 60)}`.padStart(2, '0')}:${`${total % 60}`.padStart(2, '0')}`;
};

/**
 * Minutes between two `HH:mm` values, treating an earlier end as next-day.
 *
 * A block from 23:00 to 01:00 is two hours, not minus twenty-two — and someone
 * planning a late session should not be told the form is invalid for it.
 */
export const minutesBetween = (start: string, end: string): number => {
  const [startHours, startMinutes] = start.split(':').map(Number);
  const [endHours, endMinutes] = end.split(':').map(Number);
  const diff = endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
  return diff > 0 ? diff : diff + 24 * 60;
};

/** The zone the browser is in, which is the zone the user is planning in. */
export const browserTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const monthLabel = (month: Date): string =>
  month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

/** `17:00` in the viewer's locale, for a chip that has room for little else. */
export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};
