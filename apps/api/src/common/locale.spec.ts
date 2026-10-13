import { pickLocale } from './locale';

describe('pickLocale', () => {
  it('prefers ?lang, then Accept-Language, then English', () => {
    expect(pickLocale('he', 'en-US')).toBe('he');
    expect(pickLocale('en', 'he-IL')).toBe('en');
    expect(pickLocale(undefined, 'he-IL,he;q=0.9,en;q=0.8')).toBe('he');
    expect(pickLocale(undefined, 'fr-FR, en;q=0.5, he;q=0.4')).toBe('en');
    expect(pickLocale(undefined, 'iw')).toBe('he');
    expect(pickLocale('xx', undefined)).toBe('en');
    expect(pickLocale(['he'], 'fr')).toBe('en');
  });
});
