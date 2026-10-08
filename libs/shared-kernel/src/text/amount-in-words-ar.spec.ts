import { amountInWordsAr, numberToArabicWords } from './amount-in-words-ar';

describe('Arabic amount in words (التفقيط)', () => {
  it.each([
    [0, 'صفر'],
    [1, 'واحد'],
    [11, 'أحد عشر'],
    [21, 'واحد وعشرون'],
    [100, 'مائة'],
    [102, 'مائة واثنان'],
    [250, 'مائتان وخمسون'],
    [1000, 'ألف'],
    [2000, 'ألفان'],
    [3000, 'ثلاثة آلاف'],
    [11000, 'أحد عشر ألفاً'],
    [100000, 'مائة ألف'],
    [1250345, 'مليون ومائتان وخمسون ألفاً وثلاثمائة وخمسة وأربعون'],
  ])('%d → %s', (value, words) => {
    expect(numberToArabicWords(value)).toBe(words);
  });

  it('writes money with its currency and piasters', () => {
    expect(amountInWordsAr(10260n, 'EGP')).toBe('فقط مائة واثنان جنيه مصري وستون قرشاً لا غير');
    expect(amountInWordsAr('500000', 'EGP')).toBe('فقط خمسة آلاف جنيه مصري لا غير');
    expect(amountInWordsAr(1500, 'KWD')).toBe('فقط واحد دينار كويتي وخمسمائة فلساً لا غير');
  });
});
