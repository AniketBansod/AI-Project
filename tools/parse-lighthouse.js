#!/usr/bin/env node
/*
  Parse Lighthouse JSON to print key scores.
  Usage (PowerShell):
    node tools/parse-lighthouse.js evidence/frontend/lighthouse-desktop.report.json
*/
const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/parse-lighthouse.js <path-to-lh-json>');
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(file, 'utf8'));

function pct(score) {
  if (score === null || score === undefined) return '-';
  // Lighthouse scores are 0..1
  return Math.round(score * 100);
}

const cats = report.categories || {};
const audits = report.audits || {};

const results = {
  performance: pct(cats.performance?.score),
  accessibility: pct(cats.accessibility?.score),
  bestPractices: pct(cats['best-practices']?.score),
  seo: pct(cats.seo?.score),
  // Core metrics
  fcp: audits['first-contentful-paint']?.displayValue,
  lcp: audits['largest-contentful-paint']?.displayValue,
  tbt: audits['total-blocking-time']?.displayValue,
  cls: audits['cumulative-layout-shift']?.displayValue,
  inp: audits['experimental-interactions-to-next-paint']?.displayValue || audits['interactive']?.displayValue,
};

console.log('=== Lighthouse Summary ===');
console.log(`Scores (P/A/BP/SEO): ${results.performance}/${results.accessibility}/${results.bestPractices}/${results.seo}`);
console.log(`FCP: ${results.fcp} | LCP: ${results.lcp} | TBT: ${results.tbt} | CLS: ${results.cls} | INP: ${results.inp}`);
