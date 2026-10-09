#!/bin/sh
# Turn the raw recordings in public/ into the mp3s the app plays.
#
# Each file is cut 4 ms before its first sound and faded in over 3 ms, so it
# never begins mid-wave with a click. "First sound" is 40 dB below the file's
# own peak, because the soft recordings never reach a fixed threshold.
for file in public/*.aiff; do
  case $file in
    *.mf.*) out=static ;;
    *) out=samples ;;
  esac
  peak=$(ffmpeg -i "$file" -af volumedetect -f null - 2>&1 |
    sed -n 's/.*max_volume: \(.*\) dB/\1/p')
  threshold=$(echo "$peak - 40" | bc)
  ffmpeg -v error -y -i "$file" \
    -af "silenceremove=start_periods=1:start_duration=0:start_threshold=${threshold}dB:start_silence=0.004,afade=t=in:st=0:d=0.003" \
    "$out/$(basename "$file" .aiff).mp3"
done
