#!/usr/bin/env node
/*
  Summarize Autocannon JSON
  Usage (PowerShell):
    node tools/parse-autocannon.js evidence/backend/autocannon-post.json
*/
const fs = require('fs');

function format(n, digits = 2) {
  if (n === undefined || n === null || Number.isNaN(+n)) return '-';
  return (+n).toFixed(digits);
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/parse-autocannon.js <path-to-autocannon.json>');
  process.exit(1);
}

// Read as Buffer to handle Windows PowerShell UTF-16 output (Out-File/redirect)
const buf = fs.readFileSync(file);

function decodeBuffer(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    // UTF-16 LE BOM
    return buffer.toString('utf16le');
  }
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    // UTF-8 BOM
    return buffer.toString('utf8');
  }
  // Default to UTF-8
  return buffer.toString('utf8');
}

let raw;
let data;
try {
  raw = decodeBuffer(buf);
  data = JSON.parse(raw);
} catch (e) {
  // Last resort: try utf16le explicitly
  try {
    // Try utf16le direct
    data = JSON.parse(buf.toString('utf16le'));
  } catch (e2) {
    // Final fallback: try to extract JSON slice between first '{' and last '}' and strip NULs
    try {
      const tryRaw = (decodeBuffer(buf) || '').replace(/\u0000/g, '');
      const start = tryRaw.indexOf('{');
      const end = tryRaw.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const slice = tryRaw.slice(start, end + 1);
        data = JSON.parse(slice);
      } else {
        throw e2;
      }
    } catch (e3) {
      console.error('Failed to parse JSON. Safer alternative on Windows:');
      console.error('  cmd /c "npx autocannon ... --json > evidence\\backend\\autocannon-get.json"');
      console.error('Or pipe in PowerShell:  npx autocannon ... --json | Set-Content -Path evidence/backend/autocannon-get.json -Encoding utf8');
      throw e3;
    }
  }
}

const lat = data.latency || {};
const req = data.requests || {};

const total = req.total ?? data.requestsTotal ?? 0;
const rpsAvg = req.average ?? req.mean ?? data.throughput?.average ?? undefined;

// Status code buckets may be present at top level
const x2 = data['2xx'] ?? 0;
const x3 = data['3xx'] ?? 0;
const x4 = data['4xx'] ?? 0;
const x5 = data['5xx'] ?? 0;
const non2xxCount = (x4 + x5) || 0;
const non2xxPct = total ? (non2xxCount / total) * 100 : 0;

const summary = {
  file,
  durationSeconds: data.duration ?? '-',
  connections: data.connections ?? '-',
  latency: { p50: lat.p50 ?? '-', p95: lat.p95 ?? '-', p99: lat.p99 ?? '-' },
  requests: {
    total: total || '-',
    rpsAvg: rpsAvg || '-',
  },
  httpCodes: { '2xx': x2, '3xx': x3, '4xx': x4, '5xx': x5 },
  non2xx: {
    count: non2xxCount,
    percent: format(non2xxPct, 2)
  }
};

console.log('=== Autocannon Summary ===');
console.log(`File: ${summary.file}`);
console.log(`Duration (s): ${summary.durationSeconds} | Concurrency: ${summary.connections}`);
console.log(`Latency p50/p95/p99 (ms): ${summary.latency.p50} / ${summary.latency.p95} / ${summary.latency.p99}`);
console.log(`Requests total: ${summary.requests.total} | Avg RPS: ${summary.requests.rpsAvg}`);
console.log(`HTTP codes 2xx/3xx/4xx/5xx: ${x2}/${x3}/${x4}/${x5}`);
console.log(`Non-2xx: ${summary.non2xx.count} (${summary.non2xx.percent}%)`);
