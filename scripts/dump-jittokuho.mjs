#!/usr/bin/env node
// One-off: dump the 実特法 table of contents and the articles relevant to
// treaty-rate WHT relief at source and refund claims. Used to close the
// outstanding "verbatim 実特法 text" gap in the legal-research dossier.

import { getLawArticle } from '../dist/lib/services/law-service.js';

for (const article of ['1', '3の2']) {
  const r = await getLawArticle({ lawName: '実特法', article });
  console.log(`\n=== Art. ${article} ===`);
  console.log(r.text);
  console.log(r.egovUrl);
}

