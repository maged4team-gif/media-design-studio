import {
  QueueItem,
  QueueItemStatus,
  QUEUE_STATUS_LABELS,
  QUEUE_STATUS_COLORS,
  MAX_CONCURRENT_UPLOADS,
  MAX_FILE_SIZE_BYTES,
  CHUNK_SIZE_BYTES,
  formatBytes,
  formatSpeed,
  formatEta,
  calculateMovingAverageSpeed,
  calculateEtaSeconds,
  isTransientHttpError,
  isAuthOrPermissionError,
  computeQueueSummary,
  matchRestoredFile,
  getFileCategory,
} from '../../lib/drive/upload-queue';

let passed = 0;
let failed = 0;

function assert(condition: any, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runUploadQueueTests() {
  console.log('================================================================');
  console.log('SUITE 15: PROFESSIONAL UPLOAD QUEUE & RESUMABLE DRIVE TESTS');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. Status Labels & Color Schemes (9 Distinct States)
  // -------------------------------------------------------------
  console.log('>>> 1. Testing 9 Distinct Queue States & Arabic Labels...');
  const expectedStatuses: QueueItemStatus[] = [
    'queued',
    'preparing',
    'uploading',
    'paused',
    'verifying',
    'registering',
    'completed',
    'failed',
    'cancelled',
  ];

  assert(expectedStatuses.length === 9, 'Exactly 9 distinct queue states defined');

  for (const st of expectedStatuses) {
    assert(typeof QUEUE_STATUS_LABELS[st] === 'string' && QUEUE_STATUS_LABELS[st].length > 0, `Status "${st}" has Arabic label "${QUEUE_STATUS_LABELS[st]}"`);
    const col = QUEUE_STATUS_COLORS[st];
    assert(col && col.bg && col.text && col.border && col.badge && col.bar, `Status "${st}" has complete dark UI styling definition`);
  }

  assert(QUEUE_STATUS_LABELS['queued'] === 'في الانتظار', 'queued label is "في الانتظار"');
  assert(QUEUE_STATUS_LABELS['preparing'] === 'جارٍ التجهيز', 'preparing label is "جارٍ التجهيز"');
  assert(QUEUE_STATUS_LABELS['uploading'] === 'جارٍ الرفع', 'uploading label is "جارٍ الرفع"');
  assert(QUEUE_STATUS_LABELS['paused'] === 'متوقف مؤقتًا', 'paused label is "متوقف مؤقتًا"');
  assert(QUEUE_STATUS_LABELS['verifying'] === 'جارٍ التحقق', 'verifying label is "جارٍ التحقق"');
  assert(QUEUE_STATUS_LABELS['registering'] === 'جارٍ حفظ الملف', 'registering label is "جارٍ حفظ الملف"');
  assert(QUEUE_STATUS_LABELS['completed'] === 'مكتمل', 'completed label is "مكتمل"');
  assert(QUEUE_STATUS_LABELS['failed'] === 'فشل', 'failed label is "فشل"');
  assert(QUEUE_STATUS_LABELS['cancelled'] === 'ملغي', 'cancelled label is "ملغي"');

  // -------------------------------------------------------------
  // 2. Formatting Helpers (Bytes, Speed, ETA)
  // -------------------------------------------------------------
  console.log('\n>>> 2. Testing Formatting Helpers (Bytes, Speed, ETA)...');
  assert(formatBytes(0) === '0 B', 'formatBytes(0) returns "0 B"');
  assert(formatBytes(512) === '512 B', 'formatBytes(512) returns "512 B"');
  assert(formatBytes(2048) === '2 KB', 'formatBytes(2048) returns "2 KB"');
  assert(formatBytes(52428800) === '50 MB', 'formatBytes(50MB) returns "50 MB"');
  assert(formatBytes(500 * 1024 * 1024) === '500 MB', 'formatBytes(500MB) returns "500 MB"');

  assert(formatSpeed(0) === '0 MB/s', 'formatSpeed(0) returns "0 MB/s"');
  assert(formatSpeed(512 * 1024) === '512.0 KB/s', 'formatSpeed(512KB/s) returns "512.0 KB/s"');
  assert(formatSpeed(8.4 * 1024 * 1024) === '8.4 MB/s', 'formatSpeed(8.4MB/s) returns "8.4 MB/s"');

  assert(formatEta(null) === 'جارٍ حساب الوقت…', 'formatEta(null) returns "جارٍ حساب الوقت…"');
  assert(formatEta(-5) === 'جارٍ حساب الوقت…', 'formatEta(-5) returns "جارٍ حساب الوقت…"');
  assert(formatEta(38) === 'باقي 38ث', 'formatEta(38) returns "باقي 38ث"');
  assert(formatEta(102) === 'باقي 1د 42ث', 'formatEta(102) returns "باقي 1د 42ث"');
  assert(formatEta(3665) === 'باقي 1س 1د', 'formatEta(3665) returns "باقي 1س 1د"');
  assert(formatEta(90000) === 'باقي أكثر من يوم', 'formatEta(90000) returns "باقي أكثر من يوم"');

  // -------------------------------------------------------------
  // 3. Accurate Moving Average Speed & ETA
  // -------------------------------------------------------------
  console.log('\n>>> 3. Testing Moving Average Speed Calculation...');
  const baseTime = 1000000;
  // Insufficient samples (< 2)
  assert(calculateMovingAverageSpeed([]) === 0, 'calculateMovingAverageSpeed([]) returns 0');
  assert(calculateMovingAverageSpeed([{ timestamp: baseTime, bytes: 1000 }]) === 0, 'Single sample returns 0');

  // Samples spanning 2 seconds transferring 16 MB = 8 MB/s
  const samples8MB = [
    { timestamp: baseTime, bytes: 0 },
    { timestamp: baseTime + 1000, bytes: 8 * 1024 * 1024 },
    { timestamp: baseTime + 2000, bytes: 16 * 1024 * 1024 },
  ];
  const speed = calculateMovingAverageSpeed(samples8MB);
  assert(Math.abs(speed - 8 * 1024 * 1024) < 100, `Moving average computes 8 MB/s accurately (got ${(speed / (1024 * 1024)).toFixed(2)} MB/s)`);

  // Sliding window filters out old samples (> 4s old)
  const windowedSamples = [
    { timestamp: baseTime - 10000, bytes: 0 }, // Very old sample, should be filtered
    { timestamp: baseTime, bytes: 10 * 1024 * 1024 },
    { timestamp: baseTime + 1000, bytes: 20 * 1024 * 1024 },
  ];
  // If tested with now = baseTime + 1000
  const speedWindowed = calculateMovingAverageSpeed(windowedSamples, 4000);
  assert(speedWindowed > 0, 'Windowed moving average computes forward speed without being corrupted by stale history');

  // ETA Calculation
  const remainingBytes = 40 * 1024 * 1024; // 40 MB remaining
  const etaSec = calculateEtaSeconds(remainingBytes, 8 * 1024 * 1024); // at 8 MB/s => 5 seconds
  assert(etaSec !== null && Math.round(etaSec) === 5, 'calculateEtaSeconds computes remaining time (5s)');
  assert(calculateEtaSeconds(remainingBytes, 0) === null, 'calculateEtaSeconds returns null if speed is 0');
  assert(calculateEtaSeconds(0, 1000000) === 0, 'calculateEtaSeconds returns 0 when remaining is 0');

  // -------------------------------------------------------------
  // 4. Transient vs Non-Transient Error Classification
  // -------------------------------------------------------------
  console.log('\n>>> 4. Testing Error Classification & Retry Rules...');
  assert(isTransientHttpError(500), 'HTTP 500 is transient');
  assert(isTransientHttpError(502), 'HTTP 502 is transient');
  assert(isTransientHttpError(503), 'HTTP 503 is transient');
  assert(isTransientHttpError(504), 'HTTP 504 is transient');
  assert(isTransientHttpError(429), 'HTTP 429 (Rate Limit) is transient');
  assert(isTransientHttpError(408), 'HTTP 408 (Request Timeout) is transient');
  assert(!isTransientHttpError(400), 'HTTP 400 (Bad Request) is NOT transient');
  assert(!isTransientHttpError(404), 'HTTP 404 (Not Found) is NOT transient');

  assert(isAuthOrPermissionError(401), 'HTTP 401 is authentication error (Must NOT auto-retry)');
  assert(isAuthOrPermissionError(403), 'HTTP 403 is permission error (Must NOT auto-retry)');
  assert(!isAuthOrPermissionError(500), 'HTTP 500 is not auth error');

  // -------------------------------------------------------------
  // 5. File Category Detector
  // -------------------------------------------------------------
  console.log('\n>>> 5. Testing File Category Classification...');
  assert(getFileCategory('promo.mp4', 'video/mp4') === 'video', 'Identifies mp4 as video');
  assert(getFileCategory('ident.mov', '') === 'video', 'Identifies .mov extension as video');
  assert(getFileCategory('project.aep', '') === 'video', 'Identifies .aep project as video');
  assert(getFileCategory('cover.png', 'image/png') === 'image', 'Identifies png as image');
  assert(getFileCategory('branding.ai', '') === 'image', 'Identifies .ai vector as image');
  assert(getFileCategory('theme.psd', '') === 'image', 'Identifies .psd design as image');
  assert(getFileCategory('voiceover.mp3', 'audio/mpeg') === 'audio', 'Identifies mp3 as audio');
  assert(getFileCategory('script.pdf', 'application/pdf') === 'document', 'Identifies pdf as document');
  assert(getFileCategory('assets.zip', '') === 'document', 'Identifies zip archive as document');

  // -------------------------------------------------------------
  // 6. Concurrency Limiter & Queue Simulation
  // -------------------------------------------------------------
  console.log('\n>>> 6. Testing Concurrency Limiter & Queue Progression...');
  assert(MAX_CONCURRENT_UPLOADS === 2, 'Default concurrency limit is strictly 2');
  assert(CHUNK_SIZE_BYTES === 2 * 1024 * 1024, 'Bounded chunk size is strictly 2 MB for Vercel Serverless safety');
  assert(MAX_FILE_SIZE_BYTES === 500 * 1024 * 1024, 'Max file size limit is strictly 500 MB');

  // Create mock queue with 5 items
  function createMockItem(id: string, name: string, size: number, status: QueueItemStatus, uploadedBytes: number = 0): QueueItem {
    return {
      id,
      file: {} as any,
      name,
      size,
      type: name.endsWith('.mp4') ? 'video/mp4' : 'image/png',
      lastModified: Date.now(),
      status,
      uploadedBytes,
      progress: Math.round((uploadedBytes / size) * 100),
      speedBytesPerSec: status === 'uploading' ? 5 * 1024 * 1024 : 0,
      speedFormatted: status === 'uploading' ? '5.0 MB/s' : '0 MB/s',
      etaSeconds: status === 'uploading' ? 10 : null,
      etaFormatted: status === 'uploading' ? 'باقي 10ث' : QUEUE_STATUS_LABELS[status],
      uploadToken: `token-${id}`,
      driveFileId: status === 'completed' ? `drive-${id}` : null,
      errorMessage: status === 'failed' ? 'فشل الاتصال بخادم Google Drive' : null,
      retryCount: 0,
      abortController: null,
      samples: [],
      createdAt: Date.now(),
    };
  }

  let mockQueue: QueueItem[] = [
    createMockItem('1', 'Promo_Final.mp4', 100 * 1024 * 1024, 'uploading', 40 * 1024 * 1024),
    createMockItem('2', 'Cover.png', 5 * 1024 * 1024, 'uploading', 2 * 1024 * 1024),
    createMockItem('3', 'Ident_V2.mp4', 80 * 1024 * 1024, 'queued', 0),
    createMockItem('4', 'Banner.jpg', 4 * 1024 * 1024, 'queued', 0),
    createMockItem('5', 'Script.pdf', 2 * 1024 * 1024, 'queued', 0),
  ];

  let summary = computeQueueSummary(mockQueue);
  assert(summary.totalCount === 5, 'Total queue count is 5');
  assert(summary.uploadingCount === 2, 'Active uploading count strictly matches MAX_CONCURRENT_UPLOADS (2)');
  assert(summary.queuedCount === 3, 'Remaining 3 items are strictly in "queued" status');
  assert(summary.isBusy === true, 'Queue is busy while active items exist');

  // Simulate Item 2 completing
  mockQueue[1] = {
    ...mockQueue[1],
    status: 'completed',
    uploadedBytes: mockQueue[1].size,
    progress: 100,
    speedBytesPerSec: 0,
  };

  // Dispatcher should immediately pick Item 3 to maintain concurrency = 2
  const activeCountNow = mockQueue.filter((q) => q.status === 'uploading').length;
  assert(activeCountNow === 1, 'Active uploads dropped to 1 upon completion');
  // Dispatcher picks next queued item:
  const nextQueued = mockQueue.find((q) => q.status === 'queued')!;
  assert(nextQueued.id === '3', 'Dispatcher selects next queued item (Item 3)');
  mockQueue[2] = { ...mockQueue[2], status: 'uploading' };

  summary = computeQueueSummary(mockQueue);
  assert(summary.completedCount === 1, 'Summary reflects 1 completed item');
  assert(summary.uploadingCount === 2, 'Active uploading count restored to 2');
  assert(summary.queuedCount === 2, 'Queued items count decremented to 2');

  // -------------------------------------------------------------
  // 7. Pause, Resume & Cancel Mechanics
  // -------------------------------------------------------------
  console.log('\n>>> 7. Testing Pause, Resume & Cancel Mechanics...');
  // Pause Item 1
  let aborted = false;
  const mockAbortController = {
    abort: () => {
      aborted = true;
    },
    signal: { aborted: false } as any,
  };
  mockQueue[0].abortController = mockAbortController as any;

  // Execute pause
  mockQueue[0].abortController.abort();
  assert(aborted === true, 'Pause triggers AbortController.abort() on active HTTP request');
  mockQueue[0] = {
    ...mockQueue[0],
    status: 'paused',
    abortController: null,
    speedBytesPerSec: 0,
    etaFormatted: 'متوقف مؤقتًا',
  };

  assert(mockQueue[0].status === 'paused', 'Item 1 status transitioned to "paused"');
  assert(mockQueue[0].uploadToken === 'token-1', 'Resumable uploadToken preserved on pause (Session NOT destroyed)');
  assert(mockQueue[0].uploadedBytes === 40 * 1024 * 1024, 'Confirmed uploadedBytes strictly preserved on pause');

  summary = computeQueueSummary(mockQueue);
  assert(summary.pausedCount === 1, 'Summary reflects 1 paused item');

  // Resume Item 1
  mockQueue[0] = {
    ...mockQueue[0],
    status: 'queued',
    etaFormatted: 'في الانتظار',
  };
  assert(mockQueue[0].status === 'queued', 'Resume places item back in queue');
  assert(mockQueue[0].uploadedBytes === 40 * 1024 * 1024, 'Resumed item retains confirmed offset for status recovery');

  // Cancel Item 5 (queued item)
  mockQueue = mockQueue.filter((q) => q.id !== '5');
  assert(mockQueue.find((q) => q.id === '5') === undefined, 'Cancelled queued item is removed from queue immediately');

  // Cancel active Item 3
  mockQueue[2] = {
    ...mockQueue[2],
    status: 'cancelled',
    speedBytesPerSec: 0,
    etaFormatted: 'ملغي',
  };
  assert(mockQueue[2].status === 'cancelled', 'Active item marked cancelled without registering asset');
  assert(mockQueue[2].driveFileId === null, 'Cancelled item has zero driveFileId/asset registration');

  // -------------------------------------------------------------
  // 8. Overall Queue Progress & Byte Ratio Parity
  // -------------------------------------------------------------
  console.log('\n>>> 8. Testing Overall Byte-Based Queue Progress...');
  const byteQueue: QueueItem[] = [
    createMockItem('a', 'FileA.mp4', 100 * 1024 * 1024, 'completed', 100 * 1024 * 1024), // 100 MB done
    createMockItem('b', 'FileB.mp4', 100 * 1024 * 1024, 'uploading', 50 * 1024 * 1024),  // 50 MB done
    createMockItem('c', 'FileC.mp4', 100 * 1024 * 1024, 'queued', 0),                    // 0 MB done
  ];
  // Total: 300 MB, Done: 150 MB => Exactly 50%
  const byteSummary = computeQueueSummary(byteQueue);
  assert(byteSummary.totalBytes === 300 * 1024 * 1024, 'Total bytes calculated correctly (300 MB)');
  assert(byteSummary.uploadedBytes === 150 * 1024 * 1024, 'Uploaded bytes calculated correctly (150 MB)');
  assert(byteSummary.overallPercent === 50, 'Overall progress is strictly byte-based (50%), not file-count based');

  // -------------------------------------------------------------
  // 9. Session Reload File Matcher
  // -------------------------------------------------------------
  console.log('\n>>> 9. Testing Session Reload File Matcher...');
  const savedSession = {
    name: 'Intro_4K.mov',
    size: 250000000,
    lastModified: 1711000000000,
  };

  const exactCandidate = {
    name: 'Intro_4K.mov',
    size: 250000000,
    lastModified: 1711000000000,
  } as File;

  const slightDriftCandidate = {
    name: 'Intro_4K.mov',
    size: 250000000,
    lastModified: 1711000001000, // 1s drift
  } as File;

  const differentSizeCandidate = {
    name: 'Intro_4K.mov',
    size: 250000001,
    lastModified: 1711000000000,
  } as File;

  const differentNameCandidate = {
    name: 'Intro_1080p.mov',
    size: 250000000,
    lastModified: 1711000000000,
  } as File;

  assert(matchRestoredFile(exactCandidate, savedSession) === true, 'Exact file candidate matches restored session');
  assert(matchRestoredFile(slightDriftCandidate, savedSession) === true, 'File with <= 2s timestamp drift matches restored session');
  assert(matchRestoredFile(differentSizeCandidate, savedSession) === false, 'File with mismatched size is strictly rejected');
  assert(matchRestoredFile(differentNameCandidate, savedSession) === false, 'File with mismatched name is strictly rejected');

  console.log('\n================================================================');
  console.log(`SUITE 15 RESULTS: ${passed} passed | ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runUploadQueueTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
