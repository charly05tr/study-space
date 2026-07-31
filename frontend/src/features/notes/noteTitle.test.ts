import { describe, expect, it } from 'vitest';
import { renameTo } from './noteTitle';

describe('renameTo', () => {
  it('sends the new name when it actually changed', () => {
    expect(renameTo('Paginación', 'Memoria virtual')).toBe('Paginación');
  });

  it('trims before deciding, and before sending', () => {
    expect(renameTo('  Paginación  ', 'Memoria virtual')).toBe('Paginación');
    // Padding is not a rename: this would otherwise fire a request, and put a
    // title with trailing spaces in the sidebar.
    expect(renameTo('  Memoria virtual  ', 'Memoria virtual')).toBeNull();
  });

  it('sends nothing when the name is untouched', () => {
    expect(renameTo('Memoria virtual', 'Memoria virtual')).toBeNull();
  });

  it('reads a cleared field as "never mind"', () => {
    // Note.title has no blank=True, so the request would be refused — and a
    // note with no title has nothing to be found by.
    expect(renameTo('', 'Memoria virtual')).toBeNull();
    expect(renameTo('     ', 'Memoria virtual')).toBeNull();
  });

  it('allows a rename that only changes case', () => {
    expect(renameTo('MEMORIA VIRTUAL', 'Memoria virtual')).toBe('MEMORIA VIRTUAL');
  });
});
