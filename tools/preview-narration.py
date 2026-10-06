#!/usr/bin/env python3
"""Read-only local review portal. Draft previews do not approve or package films.

python3 tools/preview-narration.py --build
python3 tools/preview-narration.py --serve --port 4174
"""
import argparse
import html
import json
import mimetypes
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ('sintel-dragon', 'tears-of-steel')
LEVELS = ('essential', 'standard', 'rich')
OUT = ROOT / 'pipeline/work/_review'


def read(asset, name):
    return json.loads((ROOT / 'pipeline/work' / asset / name).read_text())


def routes():
    files = {'/': OUT / 'index.html', '/index.html': OUT / 'index.html'}
    for asset in ASSETS:
        ws = ROOT / 'pipeline/work' / asset
        render, script = read(asset, 'render.json'), read(asset, 'script.json')
        for level in LEVELS:
            files[f'/{asset}/preview-{level}.mp4'] = OUT / asset / f'draft-preview-{level}.mp4'
        for cue in script['cues']:
            for level in LEVELS:
                files[f'/{asset}/{cue["id"]}-{level}.mp3'] = ws / render['cues'][cue['id']][level]['audio']
        for eid, recovery in render['recoveries'].items():
            files[f'/{asset}/recover-{eid}.mp3'] = ws / recovery['audio']
        for event in read(asset, 'observations.json')['events']:
            times = read(asset, 'frame-times.json')['frames']
            entry = max((frame for frame in times if frame['time'] <= event['availableAt']), key=lambda frame: frame['time'])
            frame = ws / entry['file']
            if frame.is_file(): files[f'/{asset}/frame-{event["id"]}.jpg'] = frame
    return files


def make_preview(asset, level):
    ws = ROOT / 'pipeline/work' / asset
    manifest, script, render = read(asset, 'manifest.json'), read(asset, 'script.json'), read(asset, 'render.json')
    destination = OUT / asset / f'draft-preview-{level}.mp4'
    destination.parent.mkdir(parents=True, exist_ok=True)
    sources = [Path(manifest['source']['path']), ws / 'script.json', ws / 'render.json']
    if destination.exists() and destination.stat().st_mtime >= max(p.stat().st_mtime for p in sources): return
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', manifest['source']['path']]
    filters, intervals = [], []
    for index, cue in enumerate(script['cues'], 1):
        variant = render['cues'][cue['id']][level]
        if variant['status'] != 'fit': raise ValueError(f'{asset}/{cue["id"]}/{level} still does not fit')
        command += ['-i', str(ws / variant['audio'])]
        at = cue['start'] + cue['margin']
        intervals.append(f'between(t,{at:.3f},{at + variant["duration"]:.3f})')
        filters.append(f'[{index}:a]adelay={round(at * 1000)}:all=1[ad{index}]')
    filters.insert(0, "[0:a]volume=0.3:enable='" + '+'.join(intervals) + "'[film]")
    labels = '[film]' + ''.join(f'[ad{i}]' for i in range(1, len(script['cues']) + 1))
    filters.append(f'{labels}amix=inputs={len(script["cues"]) + 1}:duration=first:normalize=0[mixed]')
    command += ['-filter_complex', ';'.join(filters), '-map', '0:v:0', '-map', '[mixed]', '-c:v', 'copy',
                '-c:a', 'aac', '-b:a', '192k', '-t', str(read(asset, 'analysis.json')['duration']),
                '-movflags', '+faststart', str(destination)]
    subprocess.run(command, check=True)
    print(f'Built {asset} {level} draft review preview', flush=True)


def coverage_rows(asset):
    script, render, obs = [read(asset, name) for name in ('script.json', 'render.json', 'observations.json')]
    rows = []
    for event in obs['events']:
        if not event['critical']: continue
        cues = [c for c in script['cues'] if event['id'] in c['events']]
        rows.append({'id': event['id'], 'fact': event['description'], 'availableAt': event['availableAt'],
                     'levels': {level: ' / '.join(render['cues'][c['id']][level]['text'] for c in cues) for level in LEVELS},
                     'recovery': render['recoveries'][event['id']]['text'], 'humanReview': 'pending'})
    return rows


def build_page():
    OUT.mkdir(parents=True, exist_ok=True)
    e = html.escape
    parts = ['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
             '<title>Sema narration review drafts</title><style>body{font:18px/1.5 system-ui;background:#121820;color:#f5f5f5;max-width:1100px;margin:auto;padding:24px}a{color:#8cdaff}video{width:100%;max-height:500px;background:black}audio{max-width:100%}button,select{font:inherit;padding:8px;margin:8px}article{border:1px solid #8091a4;padding:16px;margin:16px 0}summary{cursor:pointer}label{display:block}textarea{width:98%;min-height:70px;font:inherit}.draft{background:#543c00;padding:16px}img{max-width:100%}:focus-visible{outline:3px solid #ffd273}</style>',
             '<h1>Sema narration review drafts</h1><p class="draft"><strong>Human review pending.</strong> These are offline mixed review previews, not recordings of the Vega app. Nova outputs received AI editorial corrections. No approval is recorded by this page.</p>',
             '<p>Watch each complete preview, compare all three levels, then inspect each cue and recovery. Check factual accuracy, first-visible times, critical coverage, comfortable pacing, dialogue interference and pronunciation. Short windows can have identical variants. Record specific changes below; complete human approval through the pipeline review command after corrections.</p>']
    for asset in ASSETS:
        script, render, obs, manifest = [read(asset, name) for name in ('script.json','render.json','observations.json','manifest.json')]
        parts += [f'<section><h2>{e(manifest["title"])}</h2><p>{e(manifest.get("credits", ""))}</p>',
                  f'<label>Preview detail <select data-video="video-{asset}">' + ''.join(f'<option value="/{asset}/preview-{level}.mp4" {"selected" if level == "standard" else ""}>{level.title()}</option>' for level in LEVELS) + '</select></label>',
                  f'<video id="video-{asset}" controls preload="metadata" src="/{asset}/preview-standard.mp4"></video>',
                  '<h3>Proposed critical-fact coverage</h3><p>These classifications and reveal times are AI proposals. Check the source independently, including facts missing from this inventory. Text in a row is not proof that it communicates the fact.</p>',
                  '<div style="overflow:auto"><table><thead><tr><th>Proposed fact</th><th>Essential</th><th>Standard</th><th>Rich</th></tr></thead><tbody>']
        for row in coverage_rows(asset):
            parts += ['<tr><td>' + e(row['fact']) + f" ({row['availableAt']:.2f}s)</td>" + ''.join('<td>' + e(row['levels'][l]) + '</td>' for l in LEVELS) + '</tr>']
        parts += ['</tbody></table></div>',
                  f'<label>Missing facts, reveal-time or critical-classification corrections<textarea data-note="{asset}/fact-inventory"></textarea></label>',
                  f'<label>Active review minutes for this film, excluding terminal time<input type="number" min="0" step="0.1" data-review-minutes="{asset}"></label>',
                  '<h3>Narration cues</h3>']
        for cue in script['cues']:
            parts += [f'<article><h4>{e(cue["id"])} · {cue["start"]:.2f}–{cue["end"]:.2f}s</h4>',
                      f'<button data-video="video-{asset}" data-at="{max(0,cue["start"]-2):.3f}">Watch surrounding moment</button>',
                      '<p>Facts: ' + '; '.join(e(event['description']) for event in obs['events'] if event['id'] in cue['events']) + '</p>']
            for level in LEVELS:
                v = render['cues'][cue['id']][level]
                parts += [f'<p><strong>{level.title()}</strong> ({v["duration"]:.3f}s): {e(v["text"])}</p>',
                          f'<audio controls preload="none" aria-label="{e(cue["id"])} {level}" src="/{asset}/{cue["id"]}-{level}.mp3"></audio>']
            parts += [f'<label>Notes for {e(cue["id"])}<textarea data-note="{asset}/{cue["id"]}"></textarea></label></article>']
        parts += ['<h3>Visual facts and pause recovery</h3>']
        for event in obs['events']:
            eid = event['id'];v=render['recoveries'][eid]
            parts += [f'<details><summary>{e(eid)} · available {event["availableAt"]:.2f}s · {"critical" if event["critical"] else "optional"}</summary>',
                      f'<p>{e(event["description"])}</p><img loading="lazy" alt="Source frame for {e(eid)}" src="/{asset}/frame-{eid}.jpg">',
                      f'<p>Recovery: {e(v["text"])}</p><audio controls preload="none" aria-label="Recovery {e(eid)}" src="/{asset}/recover-{eid}.mp3"></audio>',
                      f'<label>Fact/timing/recovery notes<textarea data-note="{asset}/{eid}"></textarea></label></details>']
        parts += ['</section>']
    parts += ['<label>Reviewer name (for notes only)<input id="reviewer"></label><button id="export">Download review notes</button><p id="status" role="status"></p>',
              '<script>const status=document.querySelector("#status");document.querySelectorAll("audio,video").forEach(el=>{el.addEventListener("play",()=>document.querySelectorAll("audio,video").forEach(other=>{if(other!==el)other.pause()}));el.addEventListener("error",()=>status.textContent="Media failed to load. Stop and check the local review server.")});document.querySelectorAll("select[data-video]").forEach(el=>el.onchange=()=>{const v=document.getElementById(el.dataset.video);v.pause();v.src=el.value;v.load()});document.querySelectorAll("button[data-at]").forEach(el=>el.onclick=()=>{const v=document.getElementById(el.dataset.video);v.currentTime=Number(el.dataset.at);v.play().catch(()=>status.textContent="Press Play on the preview video.")});document.querySelector("#export").onclick=()=>{const notes=[...document.querySelectorAll("[data-note]")].filter(el=>el.value.trim()).map(el=>({item:el.dataset.note,note:el.value}));const reviewMinutesByAsset=Object.fromEntries([...document.querySelectorAll("[data-review-minutes]")].map(el=>[el.dataset.reviewMinutes,el.value.trim()?Number(el.value):null]));const payload={reviewMinutesByAsset,reviewer:document.querySelector("#reviewer").value,at:new Date().toISOString(),status:"Notes only; human approval not recorded",notes};const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));a.download="sema-review-notes.json";a.click();URL.revokeObjectURL(a.href);status.textContent="Notes downloaded. Complete approval through the pipeline after changes."}</script></html>']
    (OUT/'index.html').write_text('\n'.join(parts))
    # Public review scaffold, never filled in as human validation automatically.
    lines = ['# Proposed critical-fact coverage — October 4, 2026', '',
             'Generated from the current AI-prepared drafts. Human source annotation, classifications, reveal times, coverage and listening decisions are pending. An omitted fact cannot be detected from this inventory alone. A recorded text link is not semantic validation.', '']
    for asset in ASSETS:
        manifest = read(asset, 'manifest.json')
        lines += [f'## {manifest["title"]}', '', f'Source SHA-256: {manifest["source"]["sha256"]}', '',
                  '| Proposed fact and reveal time | Essential | Standard | Rich | Recovery | Human decision |',
                  '|---|---|---|---|---|---|']
        cell = lambda text: str(text).replace('|', r'\|').replace('\n', ' ')
        for row in coverage_rows(asset):
            values = [f'{row["fact"]} @ {row["availableAt"]:.2f}s', *(row['levels'][l] for l in LEVELS), row['recovery'], 'Pending']
            lines.append('| ' + ' | '.join(cell(v) for v in values) + ' |')
        lines += ['', 'Reviewer: pending. Active review minutes: pending. Missing facts/classification changes: pending.', '']
    (ROOT/'docs/verification/DRAFT-CRITICAL-COVERAGE-2026-10-04.md').write_text('\n'.join(lines))


def serve(port):
    files=routes()
    class Handler(BaseHTTPRequestHandler):
        def do_HEAD(self): self.send_file(head=True)
        def do_GET(self): self.send_file()
        def send_file(self, head=False):
            file=files.get(urlsplit(self.path).path)
            if not file or not file.is_file(): self.send_error(404); return
            size=file.stat().st_size;start,end=0,size-1;code=200
            if self.headers.get('Range'):
                import re
                match=re.fullmatch(r'bytes=(\d+)-(\d*)',self.headers['Range'])
                if not match:self.send_error(416);return
                start=int(match[1]);end=min(end,int(match[2])) if match[2] else end;code=206
                if start>end:self.send_error(416);return
            self.send_response(code);self.send_header('Content-Type',mimetypes.guess_type(file)[0] or 'application/octet-stream')
            self.send_header('Content-Length',str(end-start+1));self.send_header('Accept-Ranges','bytes');self.send_header('Cache-Control','no-store')
            if code==206:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            self.end_headers()
            if head:return
            try:
                with file.open('rb') as handle:
                    handle.seek(start);remaining=end-start+1
                    while remaining:
                        chunk=handle.read(min(remaining,65536))
                        if not chunk:break
                        self.wfile.write(chunk);remaining-=len(chunk)
            except (BrokenPipeError,ConnectionResetError):pass
        def log_message(self,*args):pass
    print(f'Sema draft review: http://127.0.0.1:{port} (read-only, no approval writes)',flush=True)
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build',action='store_true');parser.add_argument('--serve',action='store_true');parser.add_argument('--port',type=int,default=4174)
    args=parser.parse_args()
    if args.build:
        for asset in ASSETS:
            for level in LEVELS:make_preview(asset,level)
        build_page()
    if args.serve:serve(args.port)
    if not (args.build or args.serve):parser.error('use --build and/or --serve')
