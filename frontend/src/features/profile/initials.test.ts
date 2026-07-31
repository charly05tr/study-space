import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

const account = (over: Partial<Parameters<typeof initialsOf>[0]> = {}) => ({
  first_name: '',
  last_name: '',
  email: 'lector@example.com',
  ...over,
});

describe('initialsOf', () => {
  it('takes one letter from each name', () => {
    expect(initialsOf(account({ first_name: 'Ada', last_name: 'Lovelace' }))).toBe('AL');
  });

  it('uses whichever half of the name exists', () => {
    expect(initialsOf(account({ first_name: 'Ada' }))).toBe('A');
    expect(initialsOf(account({ last_name: 'Lovelace' }))).toBe('L');
  });

  it('falls back to the email when there is no name', () => {
    // Registration makes both names optional, so this is the common case, not
    // the edge one — and a blank circle would be the wrong default for it.
    expect(initialsOf(account())).toBe('L');
  });

  it('reads through whitespace rather than rendering a blank', () => {
    expect(initialsOf(account({ first_name: '   ' }))).toBe('L');
    expect(initialsOf(account({ first_name: '  Ada' }))).toBe('A');
  });

  it('handles nulls, which is what the serializer sends for an unset name', () => {
    expect(initialsOf(account({ first_name: null, last_name: null }))).toBe('L');
  });

  it('always answers something', () => {
    expect(initialsOf({ first_name: null, last_name: null, email: '' })).toBe('?');
  });

  it('is upper case whatever was typed', () => {
    expect(initialsOf(account({ first_name: 'ada', last_name: 'lovelace' }))).toBe('AL');
  });
});
