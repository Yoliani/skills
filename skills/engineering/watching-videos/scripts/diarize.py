# /// script
# requires-python = ">=3.9"
# dependencies = ["sherpa-onnx", "soundfile"]
# ///
"""Label each subtitle in a whisper .srt with its speaker.

Usage: uv run diarize.py <audio.wav> <transcript.srt> [num_speakers]

The audio must be 16 kHz mono. Writes <transcript>.speakers.srt next to the input.
Models are downloaded to ~/.cache/sherpa-onnx on first run.
"""
import re
import sys
import tarfile
import urllib.request
from pathlib import Path

import sherpa_onnx
import soundfile as sf

CACHE = Path.home() / ".cache" / "sherpa-onnx"
RELEASES = "https://github.com/k2-fsa/sherpa-onnx/releases/download"
SEG = CACHE / "sherpa-onnx-pyannote-segmentation-3-0" / "model.onnx"
EMB = CACHE / "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"


def fetch_models():
    CACHE.mkdir(parents=True, exist_ok=True)
    if not SEG.exists():
        archive = CACHE / "seg.tar.bz2"
        urllib.request.urlretrieve(f"{RELEASES}/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2", archive)
        with tarfile.open(archive) as t:
            t.extractall(CACHE)
        archive.unlink()
    if not EMB.exists():
        urllib.request.urlretrieve(f"{RELEASES}/speaker-recongition-models/{EMB.name}", EMB)


def diarize(wav, num_speakers):
    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(SEG)),
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(EMB)),
        clustering=sherpa_onnx.FastClusteringConfig(num_clusters=num_speakers, threshold=0.9),
        min_duration_on=0.3,
        min_duration_off=0.5,
    )
    sd = sherpa_onnx.OfflineSpeakerDiarization(config)
    audio, rate = sf.read(wav, dtype="float32", always_2d=True)
    if rate != sd.sample_rate:
        sys.exit(f"audio is {rate} Hz, expected {sd.sample_rate} Hz")
    return [(s.start, s.end, s.speaker) for s in sd.process(audio[:, 0]).sort_by_start_time()]


def seconds(ts):
    h, m, s = ts.replace(",", ".").split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    wav, srt = sys.argv[1], Path(sys.argv[2])
    num_speakers = int(sys.argv[3]) if len(sys.argv) > 3 else -1
    fetch_models()
    turns = diarize(wav, num_speakers)

    out = []
    for block in srt.read_text().strip().split("\n\n"):
        lines = block.splitlines()
        m = re.match(r"(\S+) --> (\S+)", lines[1]) if len(lines) > 2 else None
        if not m:
            out.append(block)
            continue
        start, end = seconds(m[1]), seconds(m[2])
        # The speaker who talks the most within this subtitle's time span.
        overlap = {}
        for t_start, t_end, spk in turns:
            o = min(end, t_end) - max(start, t_start)
            if o > 0:
                overlap[spk] = overlap.get(spk, 0) + o
        label = f"SPEAKER_{max(overlap, key=overlap.get):02d}" if overlap else "SPEAKER_?"
        out.append("\n".join(lines[:2] + [f"[{label}] {lines[2]}"] + lines[3:]))

    dest = srt.with_suffix(".speakers.srt")
    dest.write_text("\n\n".join(out) + "\n")
    print(f"{len({t[2] for t in turns})} speakers -> {dest}")


if __name__ == "__main__":
    main()
