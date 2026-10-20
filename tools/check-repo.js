// Check the current publishable source tree without inspecting ignored local files.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const files=[...new Set([...tracked,...untracked])].filter(f=>fs.existsSync(path.join(root,f)));
const errors=[];
const privatePath=/^(?:\.local|\.aws|\.codex|\.agents|artifacts|docs\/(?:panel|planning|submission|research))(?:\/|$)|^docs\/PLAN-TO-SUBMISSION\.md$/;
for(const f of new Set([...tracked,...files]))if(privatePath.test(f))errors.push(`${f}: local-only material is included in publishable source`);
const generated=new Set(['src/bundle.js','src/data.js','vega-app/buildinfo.json']);
for(const f of tracked)if(generated.has(f))errors.push(`${f}: generated output is tracked`);
const approvedPackage=files.some(f=>{
  if(!/^media\/[^/]+\/package\.json$/.test(f))return false;
  try{return JSON.parse(fs.readFileSync(path.join(root,f),'utf8')).reviewStatus==='approved';}catch{return false;}
});
let documents=0, links=0;
for(const f of files){
  const full=path.join(root,f);
  if(!fs.statSync(full).isFile() || fs.statSync(full).size>2*1024*1024)continue;
  if(!/\.(?:md|json|[cm]?js|tsx?|py|ya?ml|txt|sh)$/.test(f))continue;
  const text=fs.readFileSync(full,'utf8');
  if(/(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text))errors.push(`${f}: possible AWS access key identifier`);
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))errors.push(`${f}: private key material`);
  if(/(?:judge[- ]evaluation|panel[- ]feedback|\bjudging\s+panel\b|\bpanel\s+(?:fixes|scores)\b|\bOct(?:ober)?\s+\d+\s+panel\b)/i.test(text) || /"(?:scoresByJudge|criterionMeans|equal_weight_mean|equal_weight_average)"\s*:/.test(text))errors.push(`${f}: contains internal evaluation material`);
  if(/"awsAuthentication"\s*:/.test(text))errors.push(`${f}: contains account-session operational notes`);
  if(!f.endsWith('.md'))continue;
  documents++;
  // Public docs may state plainly that narration is still a draft; they must
  // never claim human approval that no shipped package has.
  if(!approvedPackage&&/every (?:shipped )?(?:line|word) is (?:human[- ])?approved|approves every (?:word|line)|human[- ]approved (?:narration|description)/i.test(text))errors.push(`${f}: claims human approval, but no shipped package is human-approved`);
  for(const match of text.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g)){
    let target=match[1].replace(/^<|>$/g,'');
    if(/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('#'))continue;
    target=decodeURIComponent(target.split('#')[0]);if(!target)continue;
    links++;
    const resolved=path.resolve(path.dirname(full),target);
    if(!resolved.startsWith(root+path.sep)||!fs.existsSync(resolved))errors.push(`${f}: broken local link ${target}`);
    else if(privatePath.test(path.relative(root,resolved)))errors.push(`${f}: links to local-only material`);
  }
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log(`Repository check passed: ${files.length} candidate files, ${documents} public Markdown documents, ${links} local links; no tracked local-only or generated files.`);
