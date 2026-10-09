#!/usr/bin/env python3
"""Build a runnable two-film content-review app without creating human approvals.

Reads the real AWS drafts; writes only preview/. Production packaging and the
release gate continue to require interactive human approval. No AWS calls.
"""
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'pipeline'))
from sema_pipeline.config import load_config
from sema_pipeline.integrity import file_sha256
from sema_pipeline.review import build_reviewed, blockers
from sema_pipeline.workspace import Workspace

ASSETS = ('sintel-dragon', 'tears-of-steel')

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')

def command(args):
    subprocess.run(args, check=True, cwd=ROOT)

def convert(source, out):
    signature = file_sha256(source)
    record = out.with_suffix(out.suffix + '.json')
    if out.exists() and record.exists():
        old = json.loads(record.read_text())
        if old.get('sourceSha256') == signature and old.get('renditionSha256') == file_sha256(out): return
    command(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(source),'-c:v','libvpx','-b:v','1500k',
             '-deadline','good','-cpu-used','4','-c:a','libopus','-b:a','96k',str(out)])
    write(record, {'sourceSha256': signature, 'renditionSha256': file_sha256(out), 'encoder': 'VP8 / Opus'})

def standard_mix(pkg, out):
    base = out.parent.parent.parent
    movie = base / pkg['video']
    signature = hashlib.sha256(json.dumps(pkg['cues'], sort_keys=True).encode() + movie.read_bytes() +
        b''.join((base / c['variants']['standard']['audio']).read_bytes() for c in pkg['cues'])).hexdigest()
    record = out.with_suffix('.mix.json')
    if out.exists() and record.exists() and json.loads(record.read_text()).get('inputsSha256') == signature: return
    args = ['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(movie)]
    filters, intervals = [], []
    for i,c in enumerate(pkg['cues'],1):
        v=c['variants']['standard']; at=c['start']+c['margin']
        args += ['-i',str(base/v['audio'])]
        intervals.append(f'between(t,{at:.3f},{at+v["duration"]:.3f})')
        filters.append(f'[{i}:a]adelay={round(at*1000)}:all=1[ad{i}]')
    filters.insert(0,"[0:a]volume=0.35:enable='"+'+'.join(intervals)+"'[film]")
    labels='[film]'+''.join(f'[ad{i}]' for i in range(1,len(pkg['cues'])+1))
    filters.append(f'{labels}amix=inputs={len(pkg["cues"])+1}:duration=first:normalize=0[mix]')
    args += ['-filter_complex',';'.join(filters),'-map','0:v:0','-map','[mix]','-c:v','copy','-c:a','aac',
             '-t',str(pkg['duration']),'-movflags','+faststart',str(out)]
    command(args); write(record,{'inputsSha256':signature,'scope':'Fixed Standard comparison; same narration, single mixed soundtrack'})

def build():
    out=ROOT/'preview'; cfg=load_config(); catalog=[]
    for asset in ASSETS:
        ws=Workspace(asset); manifest=ws.read('manifest.json'); analysis=ws.read('analysis.json'); render=ws.read('render.json')
        if ws.stale_inputs('render.json'): raise ValueError(f'{asset}: stale upstream authoring files')
        if render.get('mode') != 'live': raise ValueError(f'{asset}: real AWS narration required')
        doc=build_reviewed(ws,cfg); errors=blockers(doc,doc['slack'])
        if errors: raise ValueError(f'{asset}: '+ '; '.join(errors))
        source=Path(manifest['source']['path'])
        if not source.exists(): source=ROOT/'content/sources'/source.name
        if file_sha256(source)!=manifest['source']['sha256']: raise ValueError('Source checksum changed')
        target=out/'media'/asset; target.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,target/'film.mp4')
        def audio(v,name):
            dest=target/'audio'/f'{name}.mp3';dest.parent.mkdir(exist_ok=True)
            shutil.copy2(ws.dir/v['audio'],dest)
            return {k:v[k] for k in ('text','duration')} | {'audio':dest.relative_to(out).as_posix()}
        cues=[{k:c[k] for k in ('id','events','start','end','margin')} | {
            'variants':{level:audio(v,f'{c["id"]}-{level}') for level,v in c['variants'].items()}} for c in doc['cues'] if not c['dropped']]
        events=[{k:e[k] for k in ('id','scene','availableAt','critical')} | {'recovery':audio(e['recovery'],f'recover-{e["id"]}')} for e in doc['events']]
        pkg={'id':asset,'version':'review-'+hashlib.sha256(json.dumps(doc,sort_keys=True).encode()).hexdigest()[:12],
             'title':manifest['title'],'synopsis':manifest.get('synopsis',''),'credits':manifest.get('credits',''),
             'rights':manifest['rights']['text'],'reviewStatus':'draft','duration':analysis['duration'],
             'video':f'media/{asset}/film.mp4','scenes':analysis['scenes'],'dialogue':analysis['dialogue'],'cues':cues,'events':events,
             'pipeline':{'mode':'live','sourceSha256':manifest['source']['sha256'],'voice':render['voice'],
                         'editorialPreparation':'AI preparation; human approval pending'}}
        write(target/'package.json',pkg)
        convert(target/'film.mp4',target/'film.webm')
        standard_mix(pkg,target/'standard.mp4');convert(target/'standard.mp4',target/'standard.webm')
        poster_time=48 if asset=='sintel-dragon' else 29
        command(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(poster_time),'-i',str(source),'-frames:v','1','-vf','scale=960:-2','-q:v','3',str(target/'poster.jpg')])
        catalog.append({'id':asset,'package':f'media/{asset}/package.json'})
    for name in ('index.html','style.css'):
        shutil.copy2(ROOT/name,out/name)
    (out/'pipeline').mkdir(exist_ok=True)
    shutil.copy2(ROOT/'pipeline/prompts.json',out/'pipeline/prompts.json')
    shutil.copytree(ROOT/'media/prompts',out/'media/prompts',dirs_exist_ok=True)
    write(out/'media/catalog.json',{'films':catalog})
    files={p.relative_to(out).as_posix():file_sha256(p) for p in (out/'media').rglob('*') if p.is_file() and 'prompts' not in p.parts and p.name!='integrity.json'}
    write(out/'media/integrity.json',{'scope':'AI-prepared open-film review snapshot; not human approval','files':files})
    command(['node','tools/build-preview.js'])
    print('Review app ready: 2 real films, 3 levels, revisit controls and mixed Standard baselines. No human approvals created.')

if __name__=='__main__': build()
