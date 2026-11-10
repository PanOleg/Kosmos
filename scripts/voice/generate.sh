#!/bin/sh
# Озвучка (DECISIONS.md, п. 52): фрази з lines.json голосом macOS «Lesya» → MP3 у public/voice.
# Потрібні macOS (say), python3 і ffmpeg. Запуск із кореня: sh scripts/voice/generate.sh
set -e
OUT=packages/screen/public/voice
TMP=$(mktemp -d)
mkdir -p "$OUT"
python3 -c "import json;[print(k+'\t'+v) for k,v in json.load(open('scripts/voice/lines.json')).items()]" |
while IFS="$(printf '\t')" read -r id text; do
  say -v Lesya -r 178 -o "$TMP/$id.aiff" "$text"
  # Тиша на початку й у кінці геть, моно 24 кГц, 40 кбіт/с — фрази по кілька КБ.
  ffmpeg -loglevel error -y -i "$TMP/$id.aiff" \
    -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse" \
    -ac 1 -ar 24000 -b:a 40k "$OUT/$id.mp3"
done
rm -rf "$TMP"
ls "$OUT" | wc -l
