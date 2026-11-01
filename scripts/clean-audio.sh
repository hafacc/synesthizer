#!/bin/sh
# Turn the raw recordings in public/ into mp3s: every one in full in samples/,
# and the ones the app plays again in static/, cut to 10 seconds.
#
# Each file is cut 10 ms before the strike and faded in over 3 ms, so it never
# begins mid-wave with a click. The strike is the first sound within 20 dB of
# the file's own peak: some recordings have half a second of rising hiss before
# the note, and a lower threshold starts them there.
#
# The ones the app plays are also brought to the same peak, as the recordings
# were made at levels up to 20 dB apart, which leaves some notes too quiet to
# hear in a chord. The mf recording of Gb7 is a copy of G7, so the app plays
# the ff one in its place.
#
# The app holds every note it plays in memory uncompressed, and by 10 seconds
# a note has faded into the recording's hiss, so the rest is cut off with a
# half-second fade.
target=-22

# the filters that cut a recording to start on its strike
start() {
  peak=$(ffmpeg -i "$1" -af volumedetect -f null - 2>&1 |
    sed -n 's/.*max_volume: \(.*\) dB/\1/p')
  threshold=$(echo "$peak - 20" | bc)
  echo "silenceremove=start_periods=1:start_duration=0:start_threshold=${threshold}dB:start_silence=0.010,afade=t=in:st=0:d=0.003"
}

for file in public/*.aiff; do
  name=$(basename "$file" .aiff)
  ffmpeg -v error -y -i "$file" -af "$(start "$file")" "samples/$name.mp3"
  case $name in
    *.mf.*)
      source=$file
      if [ "$name" = Piano.mf.Gb7 ]; then
        source=public/Piano.ff.Gb7.aiff
      fi
      peak=$(ffmpeg -i "$source" -af volumedetect -f null - 2>&1 |
        sed -n 's/.*max_volume: \(.*\) dB/\1/p')
      gain=$(echo "$target - $peak" | bc)
      ffmpeg -v error -y -i "$source" \
        -af "$(start "$source"),volume=${gain}dB,atrim=end=10,afade=t=out:st=9.5:d=0.5" \
        "static/$name.mp3"
      ;;
  esac
done
