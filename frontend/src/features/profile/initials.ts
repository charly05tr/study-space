interface Named {
  first_name: string | null;
  last_name: string | null;
  email: string;
}

/**
 * Initials from whatever the account actually has.
 *
 * A great many accounts here are an email and nothing else — registration
 * makes both names optional — so falling back to the email keeps the mark from
 * being a blank circle for exactly the people most likely to see it.
 */
export const initialsOf = (user: Named) => {
  const fromName = [user.first_name, user.last_name]
    .map((part) => part?.trim()?.[0])
    .filter(Boolean)
    .join('');

  return (fromName || user.email.trim()[0] || '?').toUpperCase();
};
