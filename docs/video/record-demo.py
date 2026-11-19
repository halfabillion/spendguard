#!/usr/bin/env python3
"""Render a silent, captioned SpendGuard terminal demo with ffmpeg.

Re-runs `npm test` and `node src/cli.js cases` for real output, then paints
frames (IBM Plex Mono) and encodes submit/video/spendguard-escrow-demo.mp4.
No secrets are printed. No new paid Telegraph call is made.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "submit" / "video" / "spendguard-escrow-demo.mp4"
WIDTH, HEIGHT = 1280, 720
FPS = 30
CAPTION_H = 118
MARGIN = 48
FONT_REG = "/usr/share/fonts/truetype/sand-box/google/IBM Plex Mono/IBMPlexMono-Regular.ttf"
FONT_MED = "/usr/share/fonts/truetype/sand-box/google/IBM Plex Mono/IBMPlexMono-Medium.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/sand-box/google/IBM Plex Mono/IBMPlexMono-Bold.ttf"
FONT_SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_SANS_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

BG = (9, 14, 26)
PANEL = (15, 22, 38)
BORDER = (38, 52, 78)
FG = (230, 236, 245)
DIM = (140, 154, 176)
GREEN = (80, 214, 140)
RED = (255, 122, 122)
AMBER = (255, 196, 92)
CYAN = (110, 210, 230)
PROMPT = (125, 211, 252)
WHITE = (255, 255, 255)
CAPTION_BG = (8, 12, 22)


def font(path, size):
    return ImageFont.truetype(path, size)


def wrap_text(draw, text, fnt, max_width):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = w if not cur else f"{cur} {w}"
        if draw.textlength(trial, font=fnt) <= max_width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


def colorize(line: str):
    s = line.rstrip("\n")
    if s.startswith("$ "):
        return PROMPT
    if s.startswith("ℹ tests") or s.startswith("ℹ pass") or "pass 29" in s or "decision\": \"allow\"" in s or "blocked\": true" in s or "skippedPurchase\": true" in s or s.startswith("evidence written"):
        return GREEN
    if "fail 0" in s or s.strip() == "ℹ fail 0":
        return GREEN
    if s.startswith("DENY") or s.startswith("SPEND LIMIT") or s.startswith("ALLOW") or s.startswith("SpendGuard"):
        return CYAN
    if "\"deny\"" in s or "SPEND_CAP" in s:
        return AMBER
    if s.startswith("✖") or "fail " in s and "fail 0" not in s:
        return RED
    if s.startswith("   evidence/"):
        return GREEN
    return FG


def new_frame():
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)
    # window
    x0, y0 = 28, 28
    x1, y1 = WIDTH - 28, HEIGHT - CAPTION_H - 16
    draw.rounded_rectangle([x0, y0, x1, y1], radius=16, fill=PANEL, outline=BORDER, width=2)
    for i, c in enumerate(((255, 96, 96), (255, 196, 80), (80, 200, 120))):
        draw.ellipse([x0 + 18 + i * 22, y0 + 14, x0 + 32 + i * 22, y0 + 28], fill=c)
    title_f = font(FONT_MED, 16)
    draw.text((x0 + 96, y0 + 12), "spendguard — local testnet demo", font=title_f, fill=DIM)
    return img, draw, (x0 + 28, y0 + 46, x1 - 20, y1 - 16)


def draw_caption(draw, caption: str):
    bar_y = HEIGHT - CAPTION_H
    draw.rectangle([0, bar_y, WIDTH, HEIGHT], fill=CAPTION_BG)
    draw.line([0, bar_y, WIDTH, bar_y], fill=BORDER, width=2)
    fnt = font(FONT_SANS, 28)
    max_w = WIDTH - 2 * MARGIN
    lines = wrap_text(draw, caption, fnt, max_w)
    total_h = len(lines) * 36
    y = bar_y + (CAPTION_H - total_h) // 2 - 2
    for line in lines:
        draw.text((MARGIN, y), line, font=fnt, fill=WHITE)
        y += 36


def draw_lines(draw, area, lines, line_h=28, size=20, pin="end"):
    x, y, x1, y1 = area
    fnt = font(FONT_REG, size)
    max_rows = max(1, (y1 - y) // line_h)
    visible = lines[:max_rows] if pin == "start" else lines[-max_rows:]
    cy = y
    for line in visible:
        # wrap long lines
        text = line.replace("\t", "  ")
        if draw.textlength(text, font=fnt) > (x1 - x):
            # hard wrap by characters
            acc = ""
            chunks = []
            for ch in text:
                if draw.textlength(acc + ch, font=fnt) > (x1 - x):
                    chunks.append(acc)
                    acc = ch
                else:
                    acc += ch
            if acc:
                chunks.append(acc)
            for part in chunks:
                if cy + line_h > y1:
                    return
                draw.text((x, cy), part, font=fnt, fill=colorize(line))
                cy += line_h
        else:
            if cy + line_h > y1:
                return
            draw.text((x, cy), text, font=fnt, fill=colorize(line))
            cy += line_h


def draw_title(draw, area):
    x, y, _, _ = area
    title = font(FONT_SANS_BOLD, 48)
    sub = font(FONT_SANS, 26)
    mono = font(FONT_MED, 20)
    draw.text((x, y + 40), "SpendGuard", font=title, fill=WHITE)
    draw.text((x, y + 108), "Telegraph Hackathon Season II  ·  Mission 02 Stablecoin", font=sub, fill=CYAN)
    lines = [
        "Pre-settlement compliance gate and agent expense ledger",
        "Default live rail: Diamond escrow   (TELEGRAPH_PAY=key)",
        "x402 is experimental — facilitator /settle timed out, nothing settled",
        "Testnet only  ·  no new spend in this recording",
    ]
    yy = y + 190
    for line in lines:
        draw.text((x, yy), line, font=mono, fill=FG)
        yy += 36


def draw_end(draw, area):
    x, y, _, _ = area
    title = font(FONT_SANS_BOLD, 36)
    body = font(FONT_MED, 20)
    draw.text((x, y + 24), "Evidence is local. Entry is not submitted.", font=title, fill=WHITE)
    lines = [
        "allow   evidence/allow.json",
        "        receipt 0x99ca…fbf8  ·  epoch 15  ·  $0.01 test USDC",
        "deny    evidence/deny.json     ·  0 Telegraph calls  ·  $0",
        "limit   evidence/spend-limit.json  ·  SPEND_CAP before any spend",
        "",
        "Default rail: TELEGRAPH_PAY=key (escrow)",
        "Demo due 25 Nov 2026  ·  close 1 Dec 23:59 UK",
        "Final submit still needs Ali's go. No new spend without approval.",
    ]
    yy = y + 100
    for line in lines:
        draw.text((x, yy), line, font=body, fill=FG if line else DIM)
        yy += 32


def run_cmd(args, cwd):
    env = os.environ.copy()
    env.pop("TELEGRAPH_ALLOW_NEW_SPEND", None)
    env.pop("TELEGRAPH_ALLOW_DEPOSIT", None)
    env["TELEGRAPH_PAY"] = env.get("TELEGRAPH_PAY", "key")
    proc = subprocess.run(args, cwd=cwd, env=env, text=True, capture_output=True)
    out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        raise SystemExit(f"command failed ({proc.returncode}): {' '.join(args)}\n{out}")
    return out.replace("\r\n", "\n")


def ascii_glyphs(s: str) -> str:
    return (
        s.replace("▶", ">")
        .replace("✔", "PASS")
        .replace("✖", "FAIL")
        .replace("ℹ", "info")
        .replace("—", "-")
        .replace("–", "-")
        .replace("…", "...")
    )


def compact_test_output(raw: str) -> str:
    lines = [ascii_glyphs(ln.rstrip()) for ln in raw.splitlines()]
    suites = []
    summary = []
    for ln in lines:
        if ln.startswith("PASS ") and "ms)" in ln and not ln.startswith("PASS  "):
            name = ln[len("PASS "):]
            # "ExpenseLedger (8.3ms)"
            suites.append(f"  PASS  {name}")
        elif ln.startswith("info "):
            summary.append(ln.replace("info ", "  ", 1))
    compact = suites + [""] + summary
    return "\n".join(compact).strip()


def add_frames(frames, img, seconds, fps=FPS):
    n = max(1, int(round(seconds * fps)))
    frames.extend([img] * n)


def type_command_frames(base_draw_fn, prefix_lines, command, caption, seconds, fps=FPS):
    """Animate typing a shell command after any already-visible lines."""
    n = max(1, int(round(seconds * fps)))
    frames = []
    for i in range(n):
        shown = command[: max(1, int(round((i + 1) / n * len(command))))]
        cursor = "█" if i % 10 < 7 else " "
        lines = prefix_lines + [f"$ {shown}{cursor}"]
        img, draw, area = new_frame()
        draw_lines(draw, area, lines)
        draw_caption(draw, caption)
        frames.append(img)
    return frames


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    print("running npm test and node src/cli.js cases (no new spend)...")
    test_raw = run_cmd(["npm", "test"], ROOT)
    cases_raw = run_cmd(["node", "src/cli.js", "cases"], ROOT)
    test_view = compact_test_output(test_raw)
    # Confirm we really had a green run
    if "fail 0" not in test_raw and "pass 29" not in test_raw:
        raise SystemExit("tests were not green; refusing to record\n" + test_raw[-2000:])
    if "receipt_hash" not in cases_raw or "0x99ca" not in cases_raw:
        raise SystemExit("cases output missing confirmed receipt; refusing to record")

    cases_lines = [ln.rstrip() for ln in cases_raw.splitlines() if ln.rstrip() or True]
    # drop trailing empties but keep internal blanks (collapse 2+)
    cleaned = []
    for ln in cases_lines:
        if ln.strip() == "" and cleaned and cleaned[-1] == "":
            continue
        cleaned.append(ln)
    cases_lines = [ascii_glyphs(ln) for ln in cleaned]

    # Build scenes as accumulated terminal text
    frames = []

    # Title
    img, draw, area = new_frame()
    draw_title(draw, area)
    draw_caption(draw, "Pre-settlement compliance gate. Testnet only. No new spend in this recording.")
    add_frames(frames, img, 8)

    # Type npm test
    frames += type_command_frames(None, [], "npm test", "All unit tests are green, including the escrow cap and the three evidence cases.", 3.2)
    test_lines = ["$ npm test"] + test_view.splitlines()
    img, draw, area = new_frame()
    draw_lines(draw, area, test_lines, line_h=26, size=18)
    draw_caption(draw, "All unit tests are green, including the escrow cap and the three evidence cases.")
    add_frames(frames, img, 11)

    # Type cases
    prefix = test_lines + ["", ""]
    # start a fresh terminal page for readability
    frames += type_command_frames(None, [], "node src/cli.js cases", "A denylisted payee is blocked before any Telegraph call. Zero spend.", 3.4)

    # Reveal cases in three holds: intro+deny, spend-limit, allow+paths
    def split_cases(lines):
        text = "\n".join(lines)
        deny_i = next(i for i, l in enumerate(lines) if l.startswith("DENY"))
        limit_i = next(i for i, l in enumerate(lines) if l.startswith("SPEND LIMIT"))
        allow_i = next(i for i, l in enumerate(lines) if l.startswith("ALLOW"))
        ev_i = next(i for i, l in enumerate(lines) if l.startswith("evidence written"))
        return (
            ["$ node src/cli.js cases"] + lines[:limit_i],
            ["$ node src/cli.js cases"] + lines[:allow_i],
            ["$ node src/cli.js cases"] + lines,
        )

    deny_page, limit_page, allow_page = split_cases(cases_lines)

    img, draw, area = new_frame()
    draw_lines(draw, area, deny_page, line_h=26, size=20)
    draw_caption(draw, "A denylisted payee is blocked before any Telegraph call. Zero spend.")
    add_frames(frames, img, 18)

    img, draw, area = new_frame()
    draw_lines(draw, area, limit_page, line_h=24, size=18)
    draw_caption(draw, "A $0.005 cap refuses a $0.01 ask before any engine request, signature, or spend.")
    add_frames(frames, img, 18)

    # Allow page may be long — show from ALLOW onward plus header
    allow_focus = ["$ node src/cli.js cases", ""] + cases_lines[next(i for i, l in enumerate(cases_lines) if l.startswith("ALLOW")) :]
    img, draw, area = new_frame()
    draw_lines(draw, area, allow_focus, line_h=22, size=17, pin="start")
    draw_caption(draw, "The judged purchase is the confirmed escrow receipt in epoch 15. It is reused so this update spends nothing more.")
    add_frames(frames, img, 28)

    # End card
    img, draw, area = new_frame()
    draw_end(draw, area)
    draw_caption(draw, "Local only. Final submit still needs Ali's go.")
    add_frames(frames, img, 10)

    duration = len(frames) / FPS
    if duration > 120:
        raise SystemExit(f"demo is {duration:.1f}s, over the 2 minute cap")

    with tempfile.TemporaryDirectory(prefix="spendguard-demo-") as tmp:
        tmp_path = Path(tmp)
        print(f"writing {len(frames)} frames ({duration:.1f}s) ...")
        for i, frame in enumerate(frames):
            frame.save(tmp_path / f"f{i:05d}.png")
        # slightly smaller, web-friendly
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", str(tmp_path / "f%05d.png"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "20",
            "-movflags", "+faststart",
            "-vf", "fps=30,format=yuv420p",
            str(OUT),
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration,size", "-of", "json", str(OUT)],
        check=True, capture_output=True, text=True,
    )
    info = json.loads(probe.stdout)
    print(f"wrote {OUT}")
    print(f"duration={float(info['format']['duration']):.3f}s size={info['format']['size']}")


if __name__ == "__main__":
    main()
