import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  advance,
  beginPhase,
  pause,
  restart,
  resume,
  type Phase,
  type PomodoroState,
} from '../pomodoro';

interface PomodoroStore {
  /** Which session the timer below belongs to. */
  sessionId: number | null;
  timer: PomodoroState | null;
  /**
   * Whether a phase ending rings.
   *
   * On by default: the point of a timer you can look away from is that it tells
   * you. Off is one click away because someone reading in a library needs it to
   * be, and it persists — being asked to mute the same app twice is worse than
   * the sound.
   */
  soundOn: boolean;
  /** Starts (or adopts) the timer of a session, discarding any other. */
  attach: (sessionId: number, phase?: Phase) => void;
  detach: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  restartPhase: () => void;
  nextPhase: () => void;
  toggleSound: () => void;
}

/**
 * Where the timer is, kept across reloads.
 *
 * The SESSION lives on the server; only its position in the current phase lives
 * here, because that is the part no other device can answer for. Persisting it
 * costs nothing and buys everything: the state is a pair of wall-clock marks,
 * so a phase restored an hour after the tab was closed reports the hour. The
 * timer does not resume where it was — it resumes where it would be.
 *
 * Stamped with the session id so a timer can never be read against the wrong
 * session: starting a new one replaces it outright.
 */
export const usePomodoroStore = create<PomodoroStore>()(
  persist(
    (set, get) => ({
      sessionId: null,
      timer: null,
      soundOn: true,

      attach: (sessionId, phase = 'focus') => {
        // Already this session's timer: adopt it rather than restart the phase
        // the reader is in the middle of.
        if (get().sessionId === sessionId && get().timer) return;
        set({ sessionId, timer: beginPhase(phase, Date.now()) });
      },

      detach: () => set({ sessionId: null, timer: null }),

      // Every transition goes through the pure functions in pomodoro.ts; this
      // store only decides when, never how.
      pauseTimer: () =>
        set((state) => (state.timer ? { timer: pause(state.timer, Date.now()) } : state)),
      resumeTimer: () =>
        set((state) => (state.timer ? { timer: resume(state.timer, Date.now()) } : state)),
      restartPhase: () =>
        set((state) => (state.timer ? { timer: restart(state.timer, Date.now()) } : state)),
      nextPhase: () =>
        set((state) => (state.timer ? { timer: advance(state.timer, Date.now()) } : state)),

      toggleSound: () => set((state) => ({ soundOn: !state.soundOn })),
    }),
    { name: 'pomodoro-timer' },
  ),
);
