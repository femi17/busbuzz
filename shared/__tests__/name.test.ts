import { getFirstName } from '../name';

describe('getFirstName', () => {
  test('plain name returns the first word', () => {
    expect(getFirstName('Femi Oduola')).toBe('Femi');
  });

  test('single name returns itself', () => {
    expect(getFirstName('Chidinma')).toBe('Chidinma');
  });

  test('strips a leading "Mr" title', () => {
    expect(getFirstName('Mr Femi Oduola')).toBe('Femi');
  });

  test('strips a leading title with a trailing period', () => {
    expect(getFirstName('Mrs. Ngozi Adebayo')).toBe('Ngozi');
  });

  test('strips leading Nigerian honorifics', () => {
    expect(getFirstName('Alhaji Musa Bello')).toBe('Musa');
    expect(getFirstName('Chief Engr Tunde Bakare')).toBe('Tunde');
  });

  test('is case-insensitive', () => {
    expect(getFirstName('DR Amaka Eze')).toBe('Amaka');
  });

  test('a title with no name after it falls back to the title itself', () => {
    expect(getFirstName('Mr')).toBe('Mr');
  });

  test('collapses extra whitespace between words', () => {
    expect(getFirstName('Mr   Femi   Oduola')).toBe('Femi');
  });
});
