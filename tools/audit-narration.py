#!/usr/bin/env python3
"""Inspect shipped audio and prepare local listening files. Never grants approval.

python3 tools/audit-narration.py --reels
Requires ffmpeg/ffprobe. Outputs are under ignored artifacts/extended-review/.
"""
import argparse,array,hashlib,json,math,subprocess,time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/extended-review'
LEVELS=('essential','standard','rich')
def run(args,**kwargs):
    return subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kwargs)
def ff(args):return run(['ffmpeg','-hide_banner','-loglevel','error','-threads','1',*args])
def stats(file):
    probe=json.loads(run(['ffprobe','-v','error','-select_streams','a:0','-show_entries','format=duration:stream=channels','-of','json',str(file)]).stdout)
    channels=probe['streams'][0]['channels']
    # Preserve channels: ffmpeg's default mono downmix can add gain and falsely
    # report clipping that does not exist in the original stereo soundtrack.
    samples=array.array('f',ff(['-i',str(file),'-vn','-map','0:a:0','-ar','24000','-f','f32le','-']).stdout)
    if not samples:raise ValueError(f'No decoded samples: {file}')
    peak=max(abs(x) for x in samples);rms=math.sqrt(sum(x*x for x in samples)/len(samples))
    voiced=[i for i,x in enumerate(samples) if abs(x)>10**(-45/20)]
    return {'duration':float(probe['format']['duration']),'channels':channels,'decodedSeconds':len(samples)/(24000*channels),'peakDbfs':round(20*math.log10(max(peak,1e-9)),2),'rmsDbfs':round(20*math.log10(max(rms,1e-9)),2),'samplesAtFullScale':sum(abs(x)>=0.999 for x in samples),'sampleCount':len(samples),'leadingQuietSeconds':round(voiced[0]/(24000*channels),3) if voiced else None,'trailingQuietSeconds':round((len(samples)-1-voiced[-1])/(24000*channels),3) if voiced else None,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
def safe_audio(name):
    f=(ROOT/'preview'/name).resolve()
    if not f.is_relative_to((ROOT/'preview/media').resolve()):raise ValueError('Audio path outside preview media')
    return f
def mix(p,level,dest):
    cmd=['-y','-i',str(safe_audio(p['video']))];filters=[];intervals=[]
    for i,c in enumerate(p['cues'],1):
        v=c['variants'][level];at=c['start']+c['margin'];cmd+=['-i',str(safe_audio(v['audio']))]
        intervals.append(f'between(t,{at},{at+v["duration"]})')
        filters.append(f'[{i}:a]adelay={round(at*1000)}:all=1[a{i}]')
    filters.insert(0,"[0:a]volume=0.3:enable='"+'+'.join(intervals)+"'[film]")
    filters.append('[film]'+''.join(f'[a{i}]' for i in range(1,len(p['cues'])+1))+f'amix=inputs={len(p["cues"])+1}:duration=first:normalize=0,alimiter=limit=0.85:level=0:latency=1[out]')
    cmd+=['-filter_complex_threads','1','-filter_complex',';'.join(filters),'-map','0:v:0','-map','[out]','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',str(dest)]
    ff(cmd)
def contact(p):
    # One tile per event and per cue midpoint; labels are a numbered JSON index.
    entries=[{'kind':'event','id':e['id'],'time':e['availableAt']} for e in p['events']]
    entries += [{'kind':'cue-midpoint','id':c['id'],'time':round(c['start']+c['margin']+max(v['duration'] for v in c['variants'].values())/2,3)} for c in p['cues']]
    entries.sort(key=lambda x:x['time'])
    frames=OUT/p['id']/'frames';frames.mkdir(exist_ok=True)
    for i,e in enumerate(entries):
        ff(['-y','-ss',str(e['time']),'-i',str(safe_audio(p['video'])),'-frames:v','1','-vf','scale=320:180',str(frames/f'{i:02}.png')])
        e['tile']=i+1
    rows=math.ceil(len(entries)/4)
    ff(['-y','-framerate','1','-i',str(frames/'%02d.png'),'-vf',f'tile=4x{rows}:padding=2:margin=2','-frames:v','1',str(OUT/p['id']/'contact.png')])
    (OUT/p['id']/'contact-index.json').write_text(json.dumps(entries,indent=2)+'\n')
    return entries
def recovery_reel(p):
    folder=OUT/p['id'];segments=[];position=0;index=[]
    for i,e in enumerate(p['events']):
        a=e['recovery'];frame=folder/f'recovery-{i:02}.png';seg=folder/f'recovery-{i:02}.mp4'
        ff(['-y','-ss',str(e['availableAt']),'-i',str(safe_audio(p['video'])),'-frames:v','1','-vf','scale=640:360',str(frame)])
        duration=a['duration']+0.5
        ff(['-y','-loop','1','-i',str(frame),'-i',str(safe_audio(a['audio'])),'-t',str(duration),'-vf','format=yuv420p','-r','24','-c:v','libx264','-preset','ultrafast','-c:a','aac','-af','apad','-movflags','+faststart',str(seg)])
        segments.append(seg);index.append({'id':e['id'],'atSeconds':round(position,3),'filmRevealTime':e['availableAt'],'text':a['text']});position+=duration
    listing=folder/'recovery-concat.txt';listing.write_text(''.join(f"file '{s.name}'\n" for s in segments))
    ff(['-y','-f','concat','-safe','1','-i',str(listing),'-c','copy','-movflags','+faststart',str(folder/'revisit-listening.mp4')])
    (folder/'revisit-index.json').write_text(json.dumps(index,indent=2)+'\n')
    for s in segments:s.unlink()
    return index
def source_commit():
    try:return run(['git','rev-parse','HEAD'],cwd=ROOT).stdout.decode().strip()
    except subprocess.CalledProcessError:return None

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--reels',action='store_true');args=ap.parse_args()
    OUT.mkdir(parents=True,exist_ok=True);started=time.perf_counter();report={'scope':'Decoded-signal and metadata audit, with source-frame inspection aids. Not a human listening review, transcription, or production approval. Quiet/clipping thresholds are screening heuristics.','sourceCommit':source_commit(),'films':[]}
    for name in ['sintel-dragon','tears-of-steel']:
        folder=OUT/name;folder.mkdir(exist_ok=True);p=json.loads((ROOT/'preview/media'/name/'package.json').read_text());lines=[]
        for c in p['cues']:
            for level in LEVELS:
                v=c['variants'][level];s=stats(safe_audio(v['audio']));at=c['start']+c['margin'];end=at+s['duration'];flags=[]
                if end>c['end']-c['margin']+0.001:flags.append('does-not-fit-window')
                if any(at<d['end'] and end>d['start'] for d in p['dialogue']):flags.append('recorded-dialogue-overlap')
                lines.append({'id':c['id'],'kind':'timed','level':level,'text':v['text'],'start':at,'end':end,'headroomSeconds':round(c['end']-c['margin']-end,3),'metadataDuration':v['duration'],'stats':s,'flags':flags})
        for e in p['events']:
            v=e['recovery'];lines.append({'id':e['id'],'kind':'revisit','text':v['text'],'availableAt':e['availableAt'],'metadataDuration':v['duration'],'stats':stats(safe_audio(v['audio'])),'flags':[]})
        for l in lines:
            s=l['stats'];l['wordsPerMinute']=round(len(l['text'].split())/s['duration']*60,1)
            if abs(s['duration']-l['metadataDuration'])>0.06:l['flags'].append('duration-metadata-mismatch')
            if s['peakDbfs']<-35:l['flags'].append('very-quiet-or-silent')
            if s['samplesAtFullScale']/s['sampleCount']>0.001:l['flags'].append('possible-clipping')
            if s['leadingQuietSeconds'] is not None and s['leadingQuietSeconds']>0.6:l['flags'].append('long-leading-quiet')
            if l['wordsPerMinute']>260:l['flags'].append('fast-word-rate')
        result={'film':name,'packageSha256':hashlib.sha256((ROOT/'preview/media'/name/'package.json').read_bytes()).hexdigest(),'filmSha256':hashlib.sha256(safe_audio(p['video']).read_bytes()).hexdigest(),'lines':lines,'flagged':[{'id':x['id'],'level':x.get('level'),'flags':x['flags']} for x in lines if x['flags']],'contactIndex':contact(p)}
        if args.reels:
            result['mixes']=[]
            for level in LEVELS:
                file=folder/f'{level}-listening.mp4';mix(p,level,file);result['mixes'].append({'level':level,'file':str(file.relative_to(ROOT)),'audio':stats(file)})
            result['revisitIndex']=recovery_reel(p)
        report['films'].append(result);(OUT/'narration-audit.json').write_text(json.dumps(report,indent=2)+'\n')
        print(f'{name}: {len(lines)} referenced narration records, {len(result["flagged"])} signal/timing flags',flush=True)
    report['processingSeconds']=round(time.perf_counter()-started,3);report['listeningMixNote']='Offline listening aids with fixed 0.3 film-volume ducking and a 0.85 peak limiter. They are not recordings of app playback; app volume fades differ. Revisit reel freezes each source frame at its authored reveal time.'
    (OUT/'narration-audit.json').write_text(json.dumps(report,indent=2)+'\n')
if __name__=='__main__':main()
