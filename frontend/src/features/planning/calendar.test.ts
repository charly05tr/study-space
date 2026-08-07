import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMinutesToTime,
  addMonths,
  buildMonthGrid,
  combineDateAndTime,
  DAYS_IN_WEEK,
  dateKey,
  formatDuration,
  gridRange,
  groupByDay,
  minutesBetween,
  startOfDay,
  timeValue,
  WEEKS_IN_GRID,
} from './calendar';
import type { PlannedSession } from './types';

const session = (id: number, startsAt: string): PlannedSession => ({
  id,
  goal: `Goal ${id}`,
  studyspace: 1,
  studyspace_title: 'Operating systems',
  starts_at: startsAt,
  ends_at: startsAt,
  duration_minutes: 120,
  timezone: 'America/Managua',
  reminder_offset_minutes: 60,
  reminder_sent_at: null,
  status: 'planned',
  study_session: null,
  created_at: startsAt,
  updated_at: startsAt,
});

describe('dateKey', () => {
  it('reads the local day, not the UTC one', () => {
    // The bug this guards: `toISOString().slice(0, 10)` converts to UTC first,
    // so a late evening west of Greenwich lands on the following day.
    const lateEvening = new Date(2026, 2, 3, 23, 30);
    expect(dateKey(lateEvening)).toBe('2026-03-03');
  });

  it('pads months and days', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('buildMonthGrid', () => {
  const march = new Date(2026, 2, 1);

  it('always fills six weeks', () => {
    // A five-row month next to a six-row one makes the page jump when paging.
    expect(buildMonthGrid(march).length).toBe(WEEKS_IN_GRID * DAYS_IN_WEEK);
    expect(buildMonthGrid(new Date(2026, 1, 1)).length).toBe(WEEKS_IN_GRID * DAYS_IN_WEEK);
  });

  it('starts the week on Monday', () => {
    // 1 March 2026 is a Sunday, so the grid opens on Monday 23 February.
    const grid = buildMonthGrid(march);
    expect(grid[0].date.getDay()).toBe(1);
    expect(dateKey(grid[0].date)).toBe('2026-02-23');
  });

  it('gives a Sunday first-of-month six leading days and not zero', () => {
    const grid = buildMonthGrid(march);
    expect(grid.filter((day) => !day.inMonth && day.date.getMonth() === 1).length).toBe(6);
  });

  it('marks which days belong to the month on show', () => {
    const grid = buildMonthGrid(march);
    expect(grid.filter((day) => day.inMonth).length).toBe(31);
  });

  it('marks today off the date it is given', () => {
    const grid = buildMonthGrid(march, new Date(2026, 2, 12, 9, 0));
    expect(grid.filter((day) => day.isToday).map((day) => day.key)).toEqual(['2026-03-12']);
  });

  it('counts the past by day, so this morning is not past', () => {
    const grid = buildMonthGrid(march, new Date(2026, 2, 12, 23, 59));
    const today = grid.find((day) => day.key === '2026-03-12');
    const yesterday = grid.find((day) => day.key === '2026-03-11');
    expect(today?.isPast).toBe(false);
    expect(yesterday?.isPast).toBe(true);
  });
});

describe('gridRange', () => {
  it('covers the borrowed days at both ends', () => {
    // Querying only the month would draw the neighbouring cells empty even
    // when something is planned in them.
    const { from, to } = gridRange(new Date(2026, 2, 1), new Date(2026, 2, 12));
    expect(new Date(from).getTime()).toBe(startOfDay(new Date(2026, 1, 23)).getTime());
    expect(new Date(to).getTime()).toBe(startOfDay(new Date(2026, 3, 6)).getTime());
  });

  it('ends after the last cell so a late block still falls inside', () => {
    const { to } = gridRange(new Date(2026, 2, 1), new Date(2026, 2, 12));
    const lastCellLateNight = new Date(2026, 3, 5, 23, 0);
    expect(lastCellLateNight.getTime()).toBeLessThan(new Date(to).getTime());
  });
});

describe('addMonths', () => {
  it('does not skip a month when paging off a 31st', () => {
    // `setMonth` on the 31st of a 30-day target rolls into the month after.
    const fromMarch31 = addMonths(new Date(2026, 2, 31), 1);
    expect(fromMarch31.getMonth()).toBe(3);
  });

  it('walks backwards across a year boundary', () => {
    const previous = addMonths(new Date(2026, 0, 15), -1);
    expect(previous.getFullYear()).toBe(2025);
    expect(previous.getMonth()).toBe(11);
  });
});

describe('groupByDay', () => {
  it('buckets by the local starting day', () => {
    const morning = new Date(2026, 2, 3, 9, 0);
    const evening = new Date(2026, 2, 3, 20, 0);
    const other = new Date(2026, 2, 4, 9, 0);

    const grouped = groupByDay([
      session(1, morning.toISOString()),
      session(2, evening.toISOString()),
      session(3, other.toISOString()),
    ]);

    expect(grouped.get('2026-03-03')?.map((item) => item.id)).toEqual([1, 2]);
    expect(grouped.get('2026-03-04')?.map((item) => item.id)).toEqual([3]);
  });

  it('orders each day by time regardless of the order it received', () => {
    const late = new Date(2026, 2, 3, 20, 0);
    const early = new Date(2026, 2, 3, 8, 0);

    const grouped = groupByDay([session(1, late.toISOString()), session(2, early.toISOString())]);
    expect(grouped.get('2026-03-03')?.map((item) => item.id)).toEqual([2, 1]);
  });

  it('has no bucket for a day with nothing planned', () => {
    expect(groupByDay([]).get('2026-03-03')).toBeUndefined();
  });
});

describe('combineDateAndTime', () => {
  it('builds a local instant from a day and an HH:mm', () => {
    const instant = combineDateAndTime(new Date(2026, 2, 3), '17:30');
    expect(instant.getFullYear()).toBe(2026);
    expect(instant.getMonth()).toBe(2);
    expect(instant.getDate()).toBe(3);
    expect(instant.getHours()).toBe(17);
    expect(instant.getMinutes()).toBe(30);
  });

  it('round-trips through timeValue', () => {
    expect(timeValue(combineDateAndTime(new Date(2026, 2, 3), '09:05'))).toBe('09:05');
  });
});

describe('addMinutesToTime', () => {
  it('adds within the day', () => {
    expect(addMinutesToTime('09:00', 90)).toBe('10:30');
  });

  it('rolls over midnight', () => {
    expect(addMinutesToTime('23:30', 60)).toBe('00:30');
  });
});

describe('minutesBetween', () => {
  it('measures a block inside one day', () => {
    expect(minutesBetween('09:00', '11:30')).toBe(150);
  });

  it('reads an earlier end as the next day', () => {
    // A 23:00 to 01:00 block is two hours, not minus twenty-two.
    expect(minutesBetween('23:00', '01:00')).toBe(120);
  });
});

describe('formatDuration', () => {
  it('drops the hours when there are none', () => {
    expect(formatDuration(45)).toBe('45m');
  });

  it('drops the minutes when they are zero', () => {
    expect(formatDuration(120)).toBe('2h');
  });

  it('keeps both when both are there', () => {
    expect(formatDuration(150)).toBe('2h 30m');
  });
});

describe('addDays', () => {
  it('does not mutate the date it is given', () => {
    const original = new Date(2026, 2, 3);
    addDays(original, 5);
    expect(dateKey(original)).toBe('2026-03-03');
  });
});
