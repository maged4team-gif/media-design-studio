import { normalizeArabic, matchesArabicSearch } from '../../lib/utils/arabic';

console.log('🧪 Starting Arabic Search Normalization Tests...\n');

let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

// 1. Tashkeel stripping
assert(
  normalizeArabic('أَخْبَارُ اليَوْمِ') === 'اخبار اليوم',
  'Strips all harakat/tashkeel correctly'
);

// 2. Tatweel stripping
assert(
  normalizeArabic('تــــصـــمــيــــم') === 'تصميم',
  'Strips Tatweel/Kashida'
);

// 3. Alef normalization
assert(
  normalizeArabic('إعلام آمن أستوديو ٱنتاج') === 'اعلام امن استوديو انتاج',
  'Normalizes all Alef variants to bare Alef'
);

// 4. Yaa and Alef Maksura
assert(
  normalizeArabic('محتوى إعلامي') === 'محتوي اعلامي',
  'Normalizes Alef Maksura (ى) to Yaa (ي)'
);

// 5. Taa Marbuta and Haa
assert(
  normalizeArabic('قناة تلفزيونية جديدة') === 'قناه تلفزيونيه جديده',
  'Normalizes Taa Marbuta (ة) to Haa (ه)'
);

// 6. Search Matching: "أخبار" vs "اخبار"
assert(
  matchesArabicSearch('هوية الأخبار والتقارير التلفزيونية', 'اخبار'),
  'Matches "اخبار" without hamza against "الأخبار"'
);

assert(
  matchesArabicSearch('هوية الاخبار والتقارير التلفزيونية', 'أخبار'),
  'Matches "أخبار" with hamza against "الاخبار"'
);

// 7. Search Matching: "قناة" vs "القناة" (with / without definite article)
assert(
  matchesArabicSearch('تصميم شاشة القناة الرسمية', 'قناة'),
  'Matches "قناة" (indefinite) against "القناة" (definite)'
);

assert(
  matchesArabicSearch('تصميم شاشة قناة اليمن', 'القناة'),
  'Matches "القناة" (definite query) against "قناة" (indefinite target)'
);

// 8. Tashkeel in search query
assert(
  matchesArabicSearch('مشروع جرافيك سبتمبر', 'سِبْتَمْبِر'),
  'Matches query with full tashkeel against plain target'
);

// 9. Multi-word search
assert(
  matchesArabicSearch('باقة الجرافيك الإخباري المتكامل', 'باقة اخبار'),
  'Matches multi-token query with normalized variants'
);

console.log(`\nTests finished: ${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
