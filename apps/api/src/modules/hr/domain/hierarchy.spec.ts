import { wouldCreateCycle } from './hierarchy';

describe('wouldCreateCycle', () => {
  // a ← b ← c   (c reports to b, b to a)
  const parentOf = new Map<string, string | null>([
    ['a', null],
    ['b', 'a'],
    ['c', 'b'],
    ['x', null],
  ]);

  it('allows no parent and an unrelated parent', () => {
    expect(wouldCreateCycle('a', null, parentOf)).toBe(false);
    expect(wouldCreateCycle('c', 'x', parentOf)).toBe(false);
  });

  it('refuses self as parent', () => {
    expect(wouldCreateCycle('b', 'b', parentOf)).toBe(true);
  });

  it('refuses a descendant as parent', () => {
    expect(wouldCreateCycle('a', 'c', parentOf)).toBe(true);
    expect(wouldCreateCycle('a', 'b', parentOf)).toBe(true);
  });

  it('allows moving under an ancestor', () => {
    expect(wouldCreateCycle('c', 'a', parentOf)).toBe(false);
  });

  it('stops on a pre-existing loop elsewhere', () => {
    const loop = new Map<string, string | null>([
      ['p', 'q'],
      ['q', 'p'],
    ]);
    expect(wouldCreateCycle('z', 'p', loop)).toBe(false);
  });
});
