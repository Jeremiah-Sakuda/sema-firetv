// Explicit content floors supplement timing checks; they do not establish factual accuracy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function checkDescriptionLevels(pkg, contracts) {
  const rules = contracts[pkg.id];
  if (!rules) return [`${pkg.id}: no description contracts`];
  const errors = [];
  for (const cue of pkg.cues) {
    const rule = rules[cue.id];
    if (!rule) { errors.push(`${pkg.id}/${cue.id}: no description contract`); continue; }
    for (const level of ['essential', 'standard', 'rich']) {
      const text = cue.variants[level]?.text ?? '';
      const words = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      for (const alternatives of [...(rule.all ?? []), ...(level === 'essential' ? [] : rule.standardRich ?? [])]) {
        if (!alternatives.some(term => (` ${words} `).includes(` ${term.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `)))
          errors.push(`${pkg.id}/${cue.id}/${level}: preserve ${alternatives.join(' or ')}`);
      }
    }
  }
  for (const id of Object.keys(rules)) if (!pkg.cues.some(c => c.id === id)) errors.push(`${pkg.id}/${id}: contracted cue missing`);
  return errors;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const contracts = JSON.parse(fs.readFileSync(path.join(root, 'content/description-contracts.json')));
  const errors = Object.keys(contracts).flatMap(id => checkDescriptionLevels(JSON.parse(fs.readFileSync(path.join(root, 'preview/media', id, 'package.json'))), contracts));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Description contracts passed for both films: identifying facts preserved across levels.');
}
