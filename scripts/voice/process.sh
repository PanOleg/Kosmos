#!/bin/sh
# Озвучка власним голосом (DECISIONS.md, п. 55): записи з /record.html (scripts/voice/raw/<id>.webm)
# → public/voice/<id>.mp3. Обрізає тишу на краях, знімає гул і шум, вирівнює гучність (−16 LUFS).
# Фрази без запису лишаються згенерованими (generate.sh). Запуск із кореня: sh scripts/voice/process.sh
set -e
RAW=scripts/voice/raw
OUT=packages/screen/public/voice
n=0
for f in "$RAW"/*.webm; do
  [ -e "$f" ] || continue
  id=$(basename "$f" .webm)
  ffmpeg -loglevel error -y -i "$f" \
    -af "highpass=f=75,afftdn=nf=-28,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.08,areverse,loudnorm=I=-16:TP=-1.5:LRA=11" \
    -ac 1 -ar 24000 -b:a 48k "$OUT/$id.mp3"
  n=$((n + 1))
done
echo "оброблено: $n"
