// Rebuild the portable two-film review app from the checked-in media snapshot.
// No AWS credentials, Python environment or authoring work directory required.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildBundle, buildData } from './bundle.js';
import { validatePackage } from '../src/package.js';
import { checkDescriptionLevels } from './check-description-levels.js';
import { requiredPlaybackAssets } from './playback-assets.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'preview');
const manifest=JSON.parse(fs.readFileSync(path.join(out,'media/integrity.json'),'utf8'));
for (const [file, expected] of Object.entries(manifest.files)) {
  const resolved=path.resolve(out,file);
  if (!resolved.startsWith(out+path.sep)) throw new Error('Invalid review asset path');
  const actual=crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex');
  if(actual!==expected) throw new Error(`Review asset changed: ${file}. Regenerate with npm run preview:author.`);
}
for (const name of ['index.html','style.css']) fs.copyFileSync(path.join(root,name),path.join(out,name));
fs.mkdirSync(path.join(out,'content'),{recursive:true});
fs.copyFileSync(path.join(root,'content/moment-labels.json'),path.join(out,'content/moment-labels.json'));
fs.copyFileSync(path.join(root,'content/interface-prompts.json'),path.join(out,'content/interface-prompts.json'));
fs.mkdirSync(path.join(out,'pipeline'),{recursive:true});
fs.copyFileSync(path.join(root,'pipeline/prompts.json'),path.join(out,'pipeline/prompts.json'));
fs.rmSync(path.join(out,'media/prompts'),{recursive:true,force:true});
fs.cpSync(path.join(root,'media/prompts'),path.join(out,'media/prompts'),{recursive:true});
fs.cpSync(path.join(root,'media/interface'),path.join(out,'media/interface'),{recursive:true});
fs.cpSync(path.join(root,'media/moment-labels'),path.join(out,'media/moment-labels'),{recursive:true});
const {data,missingClips,missingMomentClips}=buildData(out,console.warn,{preview:true});
if(data.films.length!==2 || missingClips.length || missingMomentClips.length) throw new Error('The review app requires both films and complete recorded guidance.');
for(const film of data.films){
  const contracts=JSON.parse(fs.readFileSync(path.join(root,'content/description-contracts.json')));
  const errors=[...validatePackage(film.package,{allowDraft:true}), ...checkDescriptionLevels(film.package,contracts)];
  if(errors.length) throw new Error(`${film.package.id}: ${errors.join('; ')}`);
  if(!film.webm || !film.standardMix || !film.standardMixWebm) throw new Error('Both playback and comparison renditions are required');
}
for (const file of requiredPlaybackAssets(data)) if (!fs.existsSync(path.join(out,file))) throw new Error(`Missing prototype playback asset: ${file}`);
fs.mkdirSync(path.join(out,'src'),{recursive:true});
fs.writeFileSync(path.join(out,'src/bundle.js'),buildBundle());
fs.writeFileSync(path.join(out,'src/data.js'),`window.SEMA_DATA = ${JSON.stringify(data)};\n`);
console.log(`Prototype ready: ${data.films.length} films, ${Object.keys(data.prompts).length} control prompts, ${Object.keys(data.momentPrompts).length} recorded moment identities.`);
