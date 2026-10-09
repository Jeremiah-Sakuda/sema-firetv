#!/usr/bin/env python3
"""Generate the fixed Standard comparison from approved production packages.

Uses the same renderer as the review app. Refuses to operate until the complete
production release check passes, including approval fingerprints and audio fits.
"""
import json
import runpy
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
check=subprocess.run(['node','tools/release-check.js'],cwd=ROOT)
if check.returncode: sys.exit(check.returncode)
renderer=runpy.run_path(str(ROOT/'tools/build-review-preview.py'))
catalog=json.loads((ROOT/'media/catalog.json').read_text())
count=0
for entry in catalog['films']:
    package=ROOT/entry['package']
    if not package.is_file(): continue
    pkg=json.loads(package.read_text())
    if pkg.get('reviewStatus')!='approved': continue
    target=package.parent/'standard.mp4'
    renderer['standard_mix'](pkg,target)
    renderer['convert'](target,target.with_suffix('.webm'))
    count+=1
print(f'Built {count} approved Standard comparison soundtracks.')
