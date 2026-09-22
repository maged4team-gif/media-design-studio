import { formatArabicFileCount, formatArabicCommentCount } from '../../lib/utils/formatters';

console.log('🧪 Starting Arabic Count Pluralization Tests...\n');

let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

// File counts tests
assert(formatArabicFileCount(0) === 'لا توجد ملفات', '0 files -> لا توجد ملفات');
assert(formatArabicFileCount(null) === 'لا توجد ملفات', 'null files -> لا توجد ملفات');
assert(formatArabicFileCount(1) === 'ملف واحد', '1 file -> ملف واحد');
assert(formatArabicFileCount(2) === 'ملفان', '2 files -> ملفان');
assert(formatArabicFileCount(3) === '3 ملفات', '3 files -> 3 ملفات');
assert(formatArabicFileCount(5) === '5 ملفات', '5 files -> 5 ملفات');
assert(formatArabicFileCount(10) === '10 ملفات', '10 files -> 10 ملفات');
assert(formatArabicFileCount(11) === '11 ملفاً', '11 files -> 11 ملفاً');
assert(formatArabicFileCount(15) === '15 ملفاً', '15 files -> 15 ملفاً');
assert(formatArabicFileCount(99) === '99 ملفاً', '99 files -> 99 ملفاً');
assert(formatArabicFileCount(100) === '100 ملف', '100 files -> 100 ملف');
assert(formatArabicFileCount(104) === '104 ملفات', '104 files -> 104 ملفات');
assert(formatArabicFileCount(115) === '115 ملفاً', '115 files -> 115 ملفاً');

// Comment counts tests
assert(formatArabicCommentCount(0) === 'لا توجد ملاحظات', '0 comments -> لا توجد ملاحظات');
assert(formatArabicCommentCount(1) === 'ملاحظة واحدة', '1 comment -> ملاحظة واحدة');
assert(formatArabicCommentCount(2) === 'ملاحظتان', '2 comments -> ملاحظتان');
assert(formatArabicCommentCount(4) === '4 ملاحظات', '4 comments -> 4 ملاحظات');
assert(formatArabicCommentCount(12) === '12 ملاحظة', '12 comments -> 12 ملاحظة');

console.log(`\nTests finished: ${failed === 0 ? 'ALL PASSED' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
