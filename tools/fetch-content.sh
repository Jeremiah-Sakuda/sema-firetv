#!/bin/sh
# Reproduces the two CC BY 3.0 film excerpts used by the demo catalog from the
# official Blender mirror. Only the excerpt ranges are read (HTTP range requests).
# Output: content/sources/*.mp4 (gitignored). Rights records: content/rights/.
set -eu
cd "$(dirname "$0")/.."
mkdir -p content/sources
enc="-c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p -c:a aac -b:a 128k -ac 2 -movflags +faststart"
ffmpeg -hide_banner -loglevel error -y -ss 0 -t 72 \
  -i https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov \
  $enc content/sources/tears-of-steel-opening.mp4
ffmpeg -hide_banner -loglevel error -y -ss 150 -t 72 \
  -i https://download.blender.org/durian/movies/Sintel.2010.1080p.mkv \
  -vf scale=1280:-2 $enc content/sources/sintel-dragon.mp4
echo "Fetched excerpts into content/sources/"
