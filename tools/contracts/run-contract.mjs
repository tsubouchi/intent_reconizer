#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

function readJson(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  const data = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(data);
}

const uiSchema = readJson('apps/frontend/contracts/firestore-contract.json');
const dbSchema = readJson('apps/intent-router/src/contracts/firestore-contract.json');

const contractsDir = path.join(rootDir, 'contracts');
if (!fs.existsSync(contractsDir)) {
  fs.mkdirSync(contractsDir, { recursive: true });
}

fs.writeFileSync(path.join(contractsDir, 'ui.json'), JSON.stringify(uiSchema, null, 2));
fs.writeFileSync(path.join(contractsDir, 'firestore.json'), JSON.stringify(dbSchema, null, 2));

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObject(value[key]);
        return acc;
      }, {});
  }
  return value;
}

const normalisedUi = sortObject(uiSchema);
const normalisedDb = sortObject(dbSchema);

const uiString = JSON.stringify(normalisedUi);
const dbString = JSON.stringify(normalisedDb);

if (uiString !== dbString) {
  console.error('❌ UI ↔ Firestore contract mismatch detected.');
  console.error('Inspect contracts/ui.json and contracts/firestore.json for differences.');
  process.exit(1);
}

console.log('✅ UI ↔ Firestore contracts are in sync.');
