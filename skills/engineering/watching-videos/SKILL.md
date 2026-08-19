---
name: watching-videos
description: Watch a video the agent can't play — a local file or a link (YouTube, Loom, direct URL) — by extracting frames and a transcript with ffmpeg. Use when the user shares a video or screen recording, asks to watch/summarize one, or wants a bug from a recording reproduced.
---

# Watching videos

You can't play a video, but you can read images and text. Turn the video into both: sample frames to see it, transcribe the audio to hear it, then work from the timeline they form together. Keep every artifact in one scratch directory and clean it up when done:

```bash
work=$(mktemp -d /tmp/watch-video.XXXXXX)
```

## 1. Acquire the file

- **Local path** — use it directly.
- **Direct file URL** (ends in `.mp4`, `.mov`, `.webm`, …) — `curl -L -o "$work/video.mp4" <url>`.
- **Page link** (YouTube, Loom, Vimeo, Drive, …) — `yt-dlp -f "bv*[height<=1080]+ba/b" -o "$work/video.%(ext)s" <url>`. If yt-dlp is missing, `brew install yt-dlp` (or `pipx install yt-dlp`) first.

Done when `ffprobe` reads the file:

```bash
ffprobe -v error -show_entries format=duration:stream=codec_type,width,height -of json "$vid"
```

Note the duration and whether an audio stream exists — both drive the next steps.

## 2. Extract frames

Two passes, both cheap:

**Scene changes** — catches cuts, page navigations, dialogs appearing:

```bash
mkdir -p "$work/frames"
ffmpeg -i "$vid" -vf "select='gt(scene,0.3)',showinfo" -fps_mode vfr "$work/frames/scene_%03d.png" 2> "$work/showinfo.log"
grep -o 'pts_time:[0-9.]*' "$work/showinfo.log"   # timestamp of each scene frame, in order
```

**Interval sampling** — fills the gaps between scene changes. Pick the interval so the whole video yields roughly 30–60 frames (`interval = duration / 40`, minimum 1s):

```bash
ffmpeg -i "$vid" -vf "fps=1/$interval" "$work/frames/t_%04d.png"   # frame N is at (N-1)*interval seconds
```

If a scene-change frame count explodes (screen recordings with cursor noise), raise the threshold to `0.4`; if it finds almost nothing, drop to `0.2`.

Done when you have Read every frame. For long videos, Read them in batches, keeping notes of what each timestamp shows. If a moment matters and no frame covers it, pull an exact frame: `ffmpeg -ss <seconds> -i "$vid" -frames:v 1 "$work/frames/at_<seconds>s.png"`.

## 3. Transcribe the audio

Skip this step only if ffprobe showed no audio stream.

```bash
ffmpeg -i "$vid" -vn -ar 16000 -ac 1 "$work/audio.wav"
model=~/.cache/whisper/ggml-base.bin
[ -f "$model" ] || { mkdir -p ~/.cache/whisper && curl -L -o "$model" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin; }
whisper-cli -m "$model" -f "$work/audio.wav" -osrt -of "$work/transcript"
```

If `whisper-cli` is missing, `brew install whisper-cpp` first. The `ggml-base.bin` model is multilingual; for English-only audio `ggml-base.en.bin` is slightly more accurate. The `.srt` output carries timestamps — keep them, they are the join key to the frames.

Done when `transcript.srt` exists and reads as coherent speech (or the video is confirmed silent).

## 4. Build the timeline and answer

Merge frames and transcript into one chronological account: at each timestamp, what is on screen and what is being said. This timeline — not the raw artifacts — is what you reason from and what you report.

Branch on what the user asked for:

- **Summary / "what happens in this video"** — deliver the timeline as prose, citing timestamps for the key moments.
- **Bug reproduction** (screen recording of an issue) — read the frames for concrete repro state: URLs and routes in the address bar, which buttons get clicked, form values, error messages and toasts, console or devtools panes if visible. Write the repro as numbered steps with expected vs. actual, each step citing its timestamp. Then reproduce it in the real app or browser and report whether the issue occurs for you too.
- **Extraction** ("what does she say at 2:10", "grab the slide about pricing") — pull the exact frame or transcript span and deliver just that.

Finish with `rm -rf "$work"`, unless the user wants the frames or transcript — then send those files before cleaning up the rest.
