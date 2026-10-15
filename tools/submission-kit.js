// Export and verify the current public source; private drafts stay outside it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=new Set(process.argv.slice(2));
if([...args].some(a=>a!=='--verify'))throw new Error('Usage: node tools/submission-kit.js [--verify]');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
execFileSync('npm',['run','repo:check'],{cwd:root,stdio:'inherit'});
const candidates=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const files={};
for(const name of [...new Set(candidates)].sort()){
  if(/^(?:\.local|\.aws|\.codex|\.agents|artifacts|node_modules)(?:\/|$)/.test(name))throw new Error(`Private path in export: ${name}`);
  const full=path.resolve(root,name);
  if(!full.startsWith(root+path.sep)||/[\r\n]/.test(name))throw new Error('Unsafe source path');
  if(!fs.existsSync(full))continue;
  if(fs.lstatSync(full).isSymbolicLink()||!fs.realpathSync(full).startsWith(fs.realpathSync(root)+path.sep))throw new Error(`Export symlink needs explicit handling: ${name}`);
  if(!fs.statSync(full).isFile())continue;
  files[name]={sha256:hash(fs.readFileSync(full)),bytes:fs.statSync(full).size};
}
const sourceId=hash(JSON.stringify(files));
const parent=path.join(root,'.local/submission/kit');fs.mkdirSync(parent,{recursive:true});
const directory=fs.mkdtempSync(path.join(parent,sourceId.slice(0,12)+'-'));
const source=path.join(directory,'source');fs.mkdirSync(source);
for(const name of Object.keys(files)){
  const to=path.join(source,name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,name),to);
}
const checks=[];
if(args.has('--verify')){
  execFileSync('git',['init','-q'],{cwd:source});
  for(const command of [['npm','ci','--offline','--ignore-scripts'],['npm','test'],['npm','run','preview:build'],['npm','run','repo:check'],['npm','run','content:check']]){
    const at=Date.now();let output='',error='',passed=true;
    try{output=execFileSync(command[0],command.slice(1),{cwd:source,encoding:'utf8',timeout:120000,maxBuffer:20*1024*1024});}
    catch(e){passed=false;output=String(e.stdout??'');error=String(e.stderr??e.message);}
    checks.push({command,passed,elapsedMs:Date.now()-at,output,error});
    fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify(checks,null,2)+'\n');
    console.log(`${passed?'PASS':'FAIL'} source copy: ${command.join(' ')}`);
    if(!passed)throw new Error(`Source verification failed; diagnostic files are in ${directory}`);
  }
}
for(const [name,record] of Object.entries(files))if(hash(fs.readFileSync(path.join(source,name)))!==record.sha256)throw new Error(`Source changed during verification: ${name}`);
const archive=path.join(directory,'sema-source.tar.gz');
// macOS tar otherwise adds AppleDouble metadata that is outside the source manifest.
const archiveEnv={...process.env,COPYFILE_DISABLE:'1'};
execFileSync('tar',['-czf',archive,'--',...Object.keys(files).map(f=>'./'+f)],{cwd:source,env:archiveEnv});
const archived=execFileSync('tar',['-tzf',archive],{encoding:'utf8',env:archiveEnv}).trim().split('\n').map(name=>name.replace(/^\.\//,'')).sort();
const expected=Object.keys(files).sort();
if(JSON.stringify(archived)!==JSON.stringify(expected))throw new Error('Source archive contents do not match the source manifest');
const tests=checks.find(c=>c.command[1]==='test')?.output.match(/# pass (\d+)/)?.[1];
const manifest={createdAt:new Date().toISOString(),sourceId,scope:'Current public source, including uncommitted edits; private material and generated output excluded.',
  sourceFiles:files,fileCount:Object.keys(files).length,totalBytes:Object.values(files).reduce((n,f)=>n+f.bytes,0),
  archive:'sema-source.tar.gz',archiveSha256:hash(fs.readFileSync(archive)),verified:args.has('--verify')&&checks.every(c=>c.passed),javascriptTests:tests?Number(tests):null,
  delivery:'Prepared locally; no repository push, video upload or Devpost submission.',node:process.version};
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(parent,'latest.json'),JSON.stringify({directory,sourceId,manifest:path.join(directory,'manifest.json'),archive},null,2)+'\n');
console.log(`Submission source prepared: ${directory}\n${manifest.fileCount} files; verified=${manifest.verified}; tests=${manifest.javascriptTests??'not run'}`);
