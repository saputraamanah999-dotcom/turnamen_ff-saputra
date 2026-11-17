#!/usr/bin/env python3
"""
STIKAR ESPORTS — BOF Sound FX generator
Sintesis efek suara esport (Free Fire tournament) → WAV → MP3.
Output: public/sfx/*.mp3 (repo turnamen).
Jalankan ulang kapan pun untuk regenerate.
"""
import numpy as np
import wave
import subprocess
import os
import shutil

SR = 44100
OUT_WAV = "/tmp/bof_sfx"
REPO_SFX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "sfx")
REPO_SFX = os.path.normpath(REPO_SFX)
os.makedirs(OUT_WAV, exist_ok=True)
os.makedirs(REPO_SFX, exist_ok=True)

rng = np.random.default_rng(2007)


def t_axis(dur):
    return np.linspace(0, dur, int(SR * dur), endpoint=False)


def env_exp(n, decay):
    return np.exp(-np.linspace(0, decay, n))


def tone(freq, t, harmonics=((1, 1.0), (2, 0.35), (3, 0.15))):
    x = np.zeros_like(t)
    for k, a in harmonics:
        x += a * np.sin(2 * np.pi * freq * k * t)
    return x


def normalize(x, peak=0.88):
    m = np.max(np.abs(x))
    return x / m * peak if m > 0 else x


def drive(x, amount=2.0):
    return np.tanh(x * amount)


def fade_edges(x, ms=6):
    n = int(SR * ms / 1000)
    if n * 2 < len(x):
        ramp = np.linspace(0, 1, n)
        x[:n] *= ramp
        x[-n:] *= ramp[::-1]
    return x


def save(name, x):
    x = normalize(x)
    x = fade_edges(x)
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    path = f"{OUT_WAV}/{name}.wav"
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return path


# ---------- 1. BEEP — tick countdown (pendek, tajam) ----------
t = t_axis(0.16)
beep = tone(1000, t) + 0.3 * np.sin(2 * np.pi * 2000 * t)
beep *= env_exp(len(t), 4.5)
save("beep", beep)

# ---------- 2. GO — GAME START (dua nada naik) ----------
a = t_axis(0.20)
b = t_axis(0.42)
n1 = tone(784, a) * env_exp(len(a), 1.6)                      # G5
n2 = drive(tone(1319, b, ((1, 1.0), (2, 0.5), (3, 0.25))), 1.6)  # E6 terang
n2 *= env_exp(len(b), 3.0)
go = np.concatenate([n1, n2])
save("go", go)

# ---------- 3. BOOYAH — fanfare kemenangan (C5-E5-G5-C6) ----------
notes = [523.25, 659.25, 783.99, 1046.5]
seg, gap = 0.14, 0.045
parts = []
for f in notes[:-1]:
    s = t_axis(seg)
    parts.append(drive(tone(f, s), 1.4) * env_exp(len(s), 1.2))
    parts.append(np.zeros(int(SR * gap)))
tf = t_axis(1.05)
chord = sum(drive(tone(f, tf), 1.2) for f in notes) / 2.4
chord *= env_exp(len(tf), 2.2)
shimmer = 0.12 * np.sin(2 * np.pi * 2093 * tf) * env_exp(len(tf), 2.0)
parts.append(chord + shimmer)
booyah = np.concatenate(parts)
save("booyah", booyah)

# ---------- 4. MATCH-END — chime turun lembut (pertandingan selesai) ----------
seq = [(1046.5, 0.30), (783.99, 0.30), (659.25, 0.30), (523.25, 0.52)]
parts = []
for f, d in seq:
    s = t_axis(d)
    body = tone(f, s, ((1, 1.0), (2, 0.22))) + 0.18 * np.sin(2 * np.pi * f * 1.5 * s)
    parts.append(body * env_exp(len(s), 2.4))
match_end = np.concatenate(parts)
save("match-end", match_end)

# ---------- 5. AIRHORN — klakson esport (Bb4 + vibrato + drive) ----------
t = t_axis(1.15)
vib = 466.16 + 11 * np.sin(2 * np.pi * 6.2 * t)
phase = 2 * np.pi * np.cumsum(vib) / SR
horn = np.zeros_like(t)
for k, a_ in ((1, 1.0), (2, 0.5), (3, 0.33), (4, 0.22), (5, 0.14), (6, 0.09)):
    horn += a_ * np.sin(k * phase)
horn += 0.4 * np.sin(phase / 2)  # sub oktaf
horn = drive(horn, 2.6)
envl = np.ones_like(t)
envl[: int(0.01 * SR)] = np.linspace(0, 1, int(0.01 * SR))
st = int(0.78 * SR)
envl[st: st + int(0.05 * SR)] *= 0.55
airhorn = horn * envl
save("airhorn", airhorn)

# ---------- 6. APPLAUSE — tepuk tangan (noise + burst acak) ----------
dur = 2.4
n = int(SR * dur)
noise = rng.standard_normal(n)
envl = np.zeros(n)
pos = 0
while pos < n:
    amp = rng.uniform(0.25, 1.0)
    ln = int(rng.uniform(0.012, 0.05) * SR)
    seg_env = amp * np.exp(-np.linspace(0, 5, ln))
    end = min(pos + ln, n)
    envl[pos:end] = np.maximum(envl[pos:end], seg_env[: end - pos])
    pos += int(rng.uniform(0.02, 0.06) * SR)
shape = np.ones(n)
shape[-int(0.9 * SR):] = np.exp(-np.linspace(0, 3.2, int(0.9 * SR)))
shape[: int(0.08 * SR)] = np.linspace(0.2, 1, int(0.08 * SR))
appl = noise * envl * shape
k = 4
appl = np.convolve(appl, np.ones(k) / k, mode="same")
save("applause", appl)

# ---------- 7. POP — notifikasi pengumuman ----------
t = t_axis(0.11)
freq = 680 * np.exp(-t * 12) + 150
phase = 2 * np.pi * np.cumsum(freq) / SR
pop = np.sin(phase) * env_exp(len(t), 6)
save("pop", pop)

# ---------- 8. SWOOSH — transisi panggung ----------
dur = 0.5
n = int(SR * dur)
noise = rng.standard_normal(n)
hump = np.exp(-((np.linspace(0, 1, n) - 0.42) ** 2) / 0.045)
car = np.sin(2 * np.pi * np.cumsum(np.linspace(2400, 300, n)) / SR)
swoosh = noise * 0.35 * hump + car * hump * 0.5
save("swoosh", swoosh)

# ---------- konversi ke MP3 ----------
if shutil.which("ffmpeg") is None:
    raise SystemExit("ffmpeg tidak ditemukan")
total = 0
for f in sorted(os.listdir(OUT_WAV)):
    if not f.endswith(".wav"):
        continue
    name = f[:-4]
    dst = f"{REPO_SFX}/{name}.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", f"{OUT_WAV}/{f}",
         "-codec:a", "libmp3lame", "-qscale:a", "4", dst],
        check=True,
    )
    size = os.path.getsize(dst)
    total += size
    print(f"{name}.mp3  {size/1024:.0f} KB")
print(f"TOTAL {total/1024:.0f} KB -> {REPO_SFX}")
