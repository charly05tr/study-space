export type ChimeKind = 'focusEnd' | 'restEnd';

/**
 * Two notes a perfect fifth apart, D5 and A5.
 *
 * The interval is the same both ways and only the direction changes, which is
 * the whole idea: falling lands, rising opens. You learn which is which after
 * hearing them once, without either of them being an alarm.
 */
const PHRASE: Record<ChimeKind, [number, number]> = {
  focusEnd: [880, 587.33],
  restEnd: [587.33, 880],
};

/** Seconds between the first note and the second. */
const SPACING = 0.16;
/** How long each note takes to fade out. */
const DECAY = 1.4;
/** Peak gain per note. Two of them overlap, so this is half of what it sounds. */
const PEAK = 0.09;

/**
 * One context for the whole tab.
 *
 * Browsers cap how many can exist, and a session can ring dozens of times over
 * an afternoon. Created lazily because constructing one before any user gesture
 * yields a suspended context on every browser that enforces autoplay.
 */
let context: AudioContext | null = null;

const audioContext = (): AudioContext | null => {
  if (context) return context;
  if (typeof window === 'undefined' || !window.AudioContext) return null;

  try {
    context = new window.AudioContext();
    return context;
  } catch {
    // Some browsers refuse outright under strict autoplay settings. A timer
    // that still counts is worth more than one that throws over a sound.
    return null;
  }
};

/** One sine note with a struck-bell envelope: near-instant attack, long decay. */
const ring = (ctx: AudioContext, frequency: number, at: number) => {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  // A hard start would click. 12ms is short enough to still read as struck.
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(PEAK, at + 0.012);
  // Exponential, not linear: a linear fade sounds like someone turning a knob,
  // and exponential is how a struck object actually loses energy. It cannot
  // reach zero, hence the floor.
  gain.gain.exponentialRampToValueAtTime(0.0001, at + DECAY);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + DECAY);
};

/**
 * Rings the end of a phase.
 *
 * Synthesised rather than shipped as a file: two sine waves are a few hundred
 * bytes of code against a sound asset in the repo, and nothing here needs to
 * load before it can play.
 *
 * Never throws. A phase change is the important part; the sound is the manners.
 */
export const playChime = (kind: ChimeKind) => {
  const ctx = audioContext();
  if (!ctx) return;

  // Suspended if it was built before the user touched anything, or if the tab
  // was backgrounded. Resuming is a promise nobody waits on: if it is refused
  // the scheduled notes simply never sound.
  void ctx.resume().catch(() => {});

  const [first, second] = PHRASE[kind];
  const at = ctx.currentTime;

  ring(ctx, first, at);
  ring(ctx, second, at + SPACING);
};
