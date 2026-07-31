/**
 * What this app lets you change about your account.
 *
 * A subset of `UserUpdateSerializer`, which also accepts `phone` and the two
 * image fields. Both are left out on purpose: a study tool has no reason to
 * hold a phone number, and the serializer requires it to be exactly eight
 * characters — so it could be set and never cleared.
 *
 * Both fields are optional because the viewset patches: one left out is left
 * alone rather than blanked.
 */
export interface ProfilePayload {
  first_name?: string;
  last_name?: string;
}
