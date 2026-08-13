#!/usr/bin/env node
/**
 * Builds dist/uai-query-library.user.js by injecting queries/catalog.json into
 * the userscript source. A userscript has to ship as one file, but queries are
 * far easier to review and contribute to as data, so they live apart and are
 * inlined here.
 *
 * Dependency-free on purpose: `node build/build.mjs` and nothing else.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src', 'uai-query-library.user.js');
const CATALOG = join(root, 'queries', 'catalog.json');
const OUT = join(root, 'dist', 'uai-query-library.user.js');

const SAVED_FILTER_PREFIX = '[Library]';
const SAVED_FILTER_MAX_NAME = 50;

const VALID_OPERATORS = [
  '=', '!=', 'IS', 'ISNOT', 'IN', 'NOTIN', 'CONTAINS', 'DOESNOTCONTAIN',
  'ONDATE', 'AFTERDATE', 'BEFOREDATE', 'INDATERANGE', 'NOTINDATERANGE',
];

/** Checks the catalog holds together before it gets baked into the script. */
function validate(catalog) {
  const errors = [];
  const seen = new Set();

  if (!catalog.catalogVersion) errors.push('catalogVersion is missing');
  if (!Array.isArray(catalog.queries)) return ['queries must be an array'];

  for (const q of catalog.queries) {
    const at = q.id || '(query with no id)';

    for (const field of ['id', 'title', 'category', 'query', 'description']) {
      if (!q[field]) errors.push(`${at}: ${field} is required`);
    }
    if (q.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(q.id)) {
      errors.push(`${at}: id must be kebab-case`);
    }
    if (q.id && seen.has(q.id)) errors.push(`${at}: duplicate id`);
    seen.add(q.id);

    // Every {{param:x}} must be declared, and every declared param must be used.
    const used = new Set([...(q.query || '').matchAll(/\{\{param:(\w+)\}\}/g)].map((m) => m[1]));
    const declared = new Set((q.params || []).map((p) => p.name));
    for (const name of used) {
      if (!declared.has(name)) errors.push(`${at}: query uses {{param:${name}}} but does not declare it`);
    }
    for (const name of declared) {
      if (!used.has(name)) errors.push(`${at}: declares param "${name}" but never uses it`);
    }
    for (const p of q.params || []) {
      if (p.default === undefined) errors.push(`${at}: param "${p.name}" has no default`);
      if (!['string', 'integer', 'relativeDate'].includes(p.type)) {
        errors.push(`${at}: param "${p.name}" has unknown type "${p.type}"`);
      }
    }

    // Quotes must balance, or the query will silently mean something else.
    const quotes = ((q.query || '').match(/"/g) || []).length;
    if (quotes % 2 !== 0) errors.push(`${at}: unbalanced double quotes`);
    const brackets = ((q.query || '').match(/\[/g) || []).length - ((q.query || '').match(/\]/g) || []).length;
    if (brackets !== 0) errors.push(`${at}: unbalanced square brackets`);
    const parens = ((q.query || '').match(/\(/g) || []).length - ((q.query || '').match(/\)/g) || []).length;
    if (parens !== 0) errors.push(`${at}: unbalanced parentheses`);

    if (!VALID_OPERATORS.some((op) => (q.query || '').includes(op))) {
      errors.push(`${at}: query contains no recognised operator`);
    }

    // The product silently discards Saved Filters whose name exceeds 50
    // characters, so catch it here rather than at install time.
    if (!q.params?.length) {
      const name = `${SAVED_FILTER_PREFIX} ${q.savedFilterName || q.title}`;
      if (name.length > SAVED_FILTER_MAX_NAME) {
        errors.push(
          `${at}: Saved Filter name is ${name.length} chars (limit ${SAVED_FILTER_MAX_NAME}). `
          + `Add a shorter "savedFilterName".`,
        );
      }
    }
  }
  return errors;
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));

const errors = validate(catalog);
if (errors.length) {
  console.error(`Catalog validation failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const source = readFileSync(SRC, 'utf8');
if (!source.includes('__CATALOG__')) {
  console.error('src is missing the __CATALOG__ placeholder.');
  process.exit(1);
}

const out = source
  .replace('__CATALOG__', JSON.stringify(catalog, null, 2))
  .replace('__VERSION__', pkg.version);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);

const counted = catalog.queries.filter((q) => q.verified === 'counted').length;
console.log(`Built ${OUT}`);
console.log(`  v${pkg.version} · ${catalog.queries.length} queries · ${counted} verified against a live tenant`);
