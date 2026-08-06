const longDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Formats an ISO string from DRF. Returns null for missing or unparseable input. */
export const formatDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : longDate.format(date);
};

/**
 * Formats a DRF DateField — "2019-05-01", a day with no time and no zone.
 *
 * Not formatDate: JavaScript parses a bare date string as UTC midnight, so
 * anywhere behind UTC that renders as the day before. A publication date is
 * a day someone wrote down, not an instant, and it has to survive the trip.
 */
export const formatDateOnly = (isoDate: string | null | undefined): string | null => {
  if (!isoDate) return null;

  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return null;

  // Local midnight, which is what the formatter then reads back unchanged.
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : longDate.format(date);
};
