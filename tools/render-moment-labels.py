#!/usr/bin/env python3
"""Render concise recorded moment names with a local Piper CLI and ffmpeg.
The engine/model are authoring dependencies; only MP3 files ship in the app.
"""
import argparse, hashlib, json, subprocess, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def run(args):
    return subprocess.check_output(args, text=True).strip()
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--piper-python', default='python3')
    parser.add_argument('--interface', action='store_true', help='Render the supplemental interface prompts instead of moment names')
    args = parser.parse_args()
    labels = json.loads((ROOT/'content/moment-labels.json').read_text())
    target = ROOT/('media/interface' if args.interface else 'media/moment-labels'); target.mkdir(parents=True, exist_ok=True)
    recordings = list(json.loads((ROOT/'content/interface-prompts.json').read_text()).items()) if args.interface else [(f'moment_{asset}_{event}'.replace('-', '_'), label.rstrip('.!?') + '.') for asset, events in labels.items() for event, label in events.items()]
    clips = {}
    with tempfile.TemporaryDirectory(prefix='sema-moment-audio-') as work:
        for identity, text in recordings:
            wav = str(Path(work)/f'{identity}.wav'); mp3 = target/f'{identity}.mp3'
            subprocess.run([args.piper_python, '-m', 'piper', '-m', str(args.model), '-f', wav, '--', text], check=True)
            subprocess.run(['ffmpeg','-v','error','-y','-i',wav,'-af','loudnorm=I=-18:TP=-1.5:LRA=7','-ar','24000','-ac','1','-q:a','2',str(mp3)],check=True)
            duration = float(run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(mp3)]))
            clips[identity] = {'text':text,'audio':mp3.relative_to(ROOT).as_posix(),'duration':duration,'sha256':hashlib.sha256(mp3.read_bytes()).hexdigest()}
    (target/'prompts.json').write_text(json.dumps(clips,indent=2)+'\n')
    version = run([args.piper_python,'-c','import importlib.metadata; print(importlib.metadata.version("piper-tts"))'])
    provenance = {'engine':'Piper','version':version,'voice':'en_US-ljspeech-high','modelSha256':hashlib.sha256(args.model.read_bytes()).hexdigest(),
        'modelCard':'https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/high/MODEL_CARD',
        'dataset':'https://keithito.com/LJ-Speech-Dataset/','datasetLicense':'Public domain',
        'scope':'Supplemental viewing-options prompts only.' if args.interface else 'Short moment identity recordings only.', 'count':len(clips)}
    (target/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    print(f'Rendered {len(clips)} recordings in {target.relative_to(ROOT)}.')
if __name__ == '__main__': main()
