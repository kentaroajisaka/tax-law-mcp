#!/usr/bin/env node
// Smoke test for the law-registry + egov-client fix.
// Calls fetchLawData against e-Gov for the previously-failing lookups.
// Run: node scripts/smoke-test.mjs

import { fetchLawData } from '../dist/lib/egov-client.js';

const cases = [
  { input: '実特法', expectedIdStartsWith: '344AC' },
  { input: '租税条約等の実施に伴う所得税法、法人税法及び地方税法の特例等に関する法律', expectedIdStartsWith: '344AC' },
  { input: '実特法施行令', expectedIdStartsWith: '362CO' },
  { input: '復興財源確保法', expectedIdStartsWith: '423AC' },
  { input: '所法', expectedIdStartsWith: '340AC' },
  { input: '措法', expectedIdStartsWith: '332AC' },
];

const failureCase = { input: '存在しない架空の法律ABCDEFG' };

let passed = 0;
let failed = 0;

for (const { input, expectedIdStartsWith } of cases) {
  try {
    const { lawId, lawTitle } = await fetchLawData(input);
    if (lawId.startsWith(expectedIdStartsWith)) {
      console.log(`PASS  ${input.padEnd(60)} -> ${lawId}  ${lawTitle.slice(0, 50)}`);
      passed++;
    } else {
      console.log(`FAIL  ${input.padEnd(60)} -> ${lawId}  (expected ${expectedIdStartsWith}...)`);
      failed++;
    }
  } catch (e) {
    console.log(`FAIL  ${input.padEnd(60)} -> threw: ${e.message}`);
    failed++;
  }
}

// Failure case: unknown law name should throw
try {
  const { lawId } = await fetchLawData(failureCase.input);
  console.log(`FAIL  ${failureCase.input.padEnd(60)} -> silent fallback to ${lawId} (should have thrown)`);
  failed++;
} catch (e) {
  console.log(`PASS  ${failureCase.input.padEnd(60)} -> threw as expected: ${e.message.slice(0, 80)}`);
  passed++;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
