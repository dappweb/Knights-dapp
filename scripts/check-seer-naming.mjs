#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const EXCLUDE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'artifacts',
  'cache',
  'coverage',
  '.turbo',
]);

const CHECK_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.sol', '.toml', '.yml', '.yaml', '.sh', '.txt'
]);

const FORBIDDEN = [
  { name: 'JBC symbol', regex: /\bJBC\b/g },
  { name: 'jbc token', regex: /\bjbc\b/g },
  { name: 'Jinbao brand', regex: /Jinbao/g },
  { name: 'jinbao brand', regex: /jinbao/g },
  { name: 'jbc-ac domain', regex: /jbc-ac/g },
  { name: 'legacy secret key', regex: /\b(?:PROD|TEST)_JBC_CONTRACT_ADDRESS\b/g },
  { name: 'legacy contract env', regex: /\bJBC_CONTRACT_ADDRESS\b/g },
];

function shouldSkip(filePath) {
  const rel = path.relative(root, filePath);
  if (!rel || rel.startsWith('..')) return true;
  if (rel.replace(/\\/g, '/') === 'scripts/check-seer-naming.mjs') return true;
  const parts = rel.split(path.sep);
  return parts.some((p) => EXCLUDE_DIRS.has(p));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (shouldSkip(abs)) continue;
    if (entry.isDirectory()) {
      walk(abs, out);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (CHECK_EXT.has(ext) || entry.name === 'package.json') {
      out.push(abs);
    }
  }
  return out;
}

function findMatches(content, regex) {
  const matches = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      matches.push(i + 1);
    }
    regex.lastIndex = 0;
  }
  return matches;
}

const files = walk(root);
const violations = [];

for (const file of files) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const rule of FORBIDDEN) {
    const lines = findMatches(content, rule.regex);
    if (lines.length > 0) {
      violations.push({
        file: path.relative(root, file).replace(/\\/g, '/'),
        rule: rule.name,
        lines,
      });
    }
  }
}

if (violations.length === 0) {
  console.log('✅ SEER naming consistency check passed. No legacy naming found.');
  process.exit(0);
}

console.error(`❌ SEER naming consistency check failed. Found ${violations.length} issue groups:`);
for (const item of violations) {
  console.error(`- ${item.file} | ${item.rule} | lines: ${item.lines.join(', ')}`);
}
process.exit(1);
