import { describe, expect, it } from 'vitest';
import {
  advance,
  beginPhase,
  durationOf,
  elapsedMs,
  formatClock,
  formatSpan,
  isRunning,
  MINUTE_MS,
  pause,
  progressOf,
  remainingMs,
  restart,
  resume,
} from './pomodoro';

const DURATIONS = { focusMinutes: 25, restMinutes: 5 };
const T0 = 1_700_000_000_000;

describe('remainingMs', () => {
  it('counts down from the phase duration', () => {
    const state = beginPhase('focus', T0);
    expect(remainingMs(state, DURATIONS, T0)).toBe(25 * MINUTE_MS);
    expect(remainingMs(state, DURATIONS, T0 + 10 * MINUTE_MS)).toBe(15 * MINUTE_MS);
  });

  it('survives a tab that was throttled or asleep', () => {
    // The whole reason time is held as wall-clock marks: no interval fired for
    // twenty minutes, and the answer is still right.
    const state = beginPhase('focus', T0);
    expect(remainingMs(state, DURATIONS, T0 + 20 * MINUTE_MS)).toBe(5 * MINUTE_MS);
  });

  it('never goes negative once the phase is over', () => {
    const state = beginPhase('rest', T0);
    expect(remainingMs(state, DURATIONS, T0 + 60 * MINUTE_MS)).toBe(0);
  });

  it('uses the duration of the phase it is in', () => {
    expect(durationOf('focus', DURATIONS)).toBe(25 * MINUTE_MS);
    expect(durationOf('rest', DURATIONS)).toBe(5 * MINUTE_MS);
  });

  it('ignores a clock that jumped backwards', () => {
    // An NTP correction mid-phase must not hand back time already spent.
    const state = beginPhase('focus', T0);
    expect(remainingMs(state, DURATIONS, T0 - 5 * MINUTE_MS)).toBe(25 * MINUTE_MS);
  });
});

describe('pause and resume', () => {
  it('freezes the remaining time while paused', () => {
    const paused = pause(beginPhase('focus', T0), T0 + 10 * MINUTE_MS);

    expect(isRunning(paused)).toBe(false);
    expect(remainingMs(paused, DURATIONS, T0 + 10 * MINUTE_MS)).toBe(15 * MINUTE_MS);
    // An hour of being paused costs nothing.
    expect(remainingMs(paused, DURATIONS, T0 + 70 * MINUTE_MS)).toBe(15 * MINUTE_MS);
  });

  it('does not charge for the pause once resumed', () => {
    const paused = pause(beginPhase('focus', T0), T0 + 10 * MINUTE_MS);
    const running = resume(paused, T0 + 70 * MINUTE_MS);

    expect(isRunning(running)).toBe(true);
    expect(remainingMs(running, DURATIONS, T0 + 70 * MINUTE_MS)).toBe(15 * MINUTE_MS);
    expect(remainingMs(running, DURATIONS, T0 + 75 * MINUTE_MS)).toBe(10 * MINUTE_MS);
  });

  it('accumulates across several pauses', () => {
    let state = beginPhase('focus', T0);
    state = pause(state, T0 + 5 * MINUTE_MS);
    state = resume(state, T0 + 100 * MINUTE_MS);
    state = pause(state, T0 + 105 * MINUTE_MS);

    expect(elapsedMs(state, T0 + 200 * MINUTE_MS)).toBe(10 * MINUTE_MS);
  });

  it('leaves an already paused timer alone', () => {
    const paused = pause(beginPhase('focus', T0), T0 + MINUTE_MS);
    expect(pause(paused, T0 + 50 * MINUTE_MS)).toBe(paused);
  });

  it('leaves an already running timer alone', () => {
    const running = beginPhase('focus', T0);
    expect(resume(running, T0 + 50 * MINUTE_MS)).toBe(running);
  });
});

describe('advance and restart', () => {
  it('alternates focus and rest, running from the top', () => {
    const rest = advance(beginPhase('focus', T0), T0 + 25 * MINUTE_MS);
    expect(rest.phase).toBe('rest');
    expect(isRunning(rest)).toBe(true);
    expect(remainingMs(rest, DURATIONS, T0 + 25 * MINUTE_MS)).toBe(5 * MINUTE_MS);

    expect(advance(rest, T0).phase).toBe('focus');
  });

  it('drops time carried by a paused phase', () => {
    // Skipping a phase you paused halfway through starts the next one whole.
    const paused = pause(beginPhase('focus', T0), T0 + 20 * MINUTE_MS);
    expect(remainingMs(advance(paused, T0 + 60 * MINUTE_MS), DURATIONS, T0 + 60 * MINUTE_MS)).toBe(
      5 * MINUTE_MS,
    );
  });

  it('restart keeps the phase and returns the full time', () => {
    const state = pause(beginPhase('focus', T0), T0 + 20 * MINUTE_MS);
    const fresh = restart(state, T0 + 60 * MINUTE_MS);

    expect(fresh.phase).toBe('focus');
    expect(isRunning(fresh)).toBe(true);
    expect(remainingMs(fresh, DURATIONS, T0 + 60 * MINUTE_MS)).toBe(25 * MINUTE_MS);
  });
});

describe('progressOf', () => {
  it('runs from 0 to 1 across the phase', () => {
    const state = beginPhase('focus', T0);
    expect(progressOf(state, DURATIONS, T0)).toBe(0);
    expect(progressOf(state, DURATIONS, T0 + 12.5 * MINUTE_MS)).toBeCloseTo(0.5);
    expect(progressOf(state, DURATIONS, T0 + 25 * MINUTE_MS)).toBe(1);
  });

  it('stops at 1 when the phase is overrun', () => {
    expect(progressOf(beginPhase('focus', T0), DURATIONS, T0 + 90 * MINUTE_MS)).toBe(1);
  });

  it('reports a zero-length phase as finished rather than dividing by zero', () => {
    const zero = { focusMinutes: 0, restMinutes: 0 };
    expect(progressOf(beginPhase('focus', T0), zero, T0)).toBe(1);
  });
});

describe('formatClock', () => {
  it('rounds up so a fresh phase reads whole', () => {
    // 24:59 on a timer you just started reads as already losing.
    expect(formatClock(25 * MINUTE_MS)).toBe('25:00');
    expect(formatClock(25 * MINUTE_MS - 1)).toBe('25:00');
  });

  it('pads both halves', () => {
    expect(formatClock(9 * MINUTE_MS + 5000)).toBe('09:05');
  });

  it('shows 00:00 only when the time is actually gone', () => {
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5000)).toBe('00:00');
  });

  it('keeps counting past an hour rather than wrapping', () => {
    expect(formatClock(90 * MINUTE_MS)).toBe('90:00');
  });
});

describe('formatSpan', () => {
  it('reports minutes under an hour', () => {
    expect(formatSpan('2026-07-30T10:00:00Z', '2026-07-30T10:45:00Z')).toBe('45m');
  });

  it('splits hours out once there are any', () => {
    expect(formatSpan('2026-07-30T10:00:00Z', '2026-07-30T11:20:00Z')).toBe('1h 20m');
  });

  it('has no answer for a session still running', () => {
    expect(formatSpan('2026-07-30T10:00:00Z', null)).toBeNull();
  });

  it('refuses nonsense rather than printing it', () => {
    expect(formatSpan('2026-07-30T10:00:00Z', 'not a date')).toBeNull();
    expect(formatSpan('2026-07-30T11:00:00Z', '2026-07-30T10:00:00Z')).toBeNull();
  });
});
