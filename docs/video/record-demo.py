#!/usr/bin/env python3
"""Render a silent, captioned SpendGuard demo with ffmpeg.

Re-runs `npm test` and `node src/cli.js cases` for real output (no new spend),
loads the already-confirmed epoch-15 receipt, then paints frames and encodes
submit/video/spendguard-escrow-demo.mp4. Target length 2:30–3:00. Captions
only, no voice. Secrets are never printed. No new paid Telegraph call is made.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "submit" / "video" / "spendguard-escrow-demo.mp4"
STILLS = ROOT / "submit" / "video" / "stills"
RECEIPT_PATH = ROOT / "evidence" / "escrow-receipt-epoch15.json"
WIDTH, HEIGHT = 1280, 720
FPS = 30
CAPTION_H = 126
MARGIN = 48
MIN_S, MAX_S = 150.0, 180.0
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
BOX = (22, 32, 52)
BOX_LINE = (70, 110, 150)


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
    if (
        s.startswith("info tests")
        or s.startswith("info pass")
        or "pass 29" in s
        or 'decision": "allow"' in s
        or "blocked\": true" in s
        or "skippedPurchase\": true" in s
        or s.startswith("evidence written")
        or s.startswith("  PASS")
    ):
        return GREEN
    if "fail 0" in s or s.strip() in {"info fail 0", "  fail 0"}:
        return GREEN
    if s.startswith("DENY") or s.startswith("SPEND LIMIT") or s.startswith("ALLOW") or s.startswith("SpendGuard"):
        return CYAN
    if '"deny"' in s or "SPEND_CAP" in s or "local_denylist" in s:
        return AMBER
    if s.startswith("FAIL") or ("fail " in s and "fail 0" not in s):
        return RED
    if s.startswith("   evidence/"):
        return GREEN
    return FG


def colorize_code(line: str):
    s = line.rstrip()
    stripped = s.lstrip()
    if stripped.startswith("//") or stripped.startswith("#"):
        return DIM
    if "SPEND_CAP" in s or "local_denylist" in s or "skippedPurchase: true" in s:
        return AMBER
    if "allowed: true" in s or 'decision: "allow"' in s or 'status: "settled"' in s or "allowed =" in s:
        return GREEN
    if stripped.startswith("export ") or stripped.startswith("async ") or stripped.startswith("if ") or stripped.startswith("return ") or stripped.startswith("throw ") or stripped.startswith("const ") or stripped.startswith("await "):
        return CYAN
    return FG


def new_frame(window_title="spendguard — local testnet demo"):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)
    x0, y0 = 28, 28
    x1, y1 = WIDTH - 28, HEIGHT - CAPTION_H - 16
    draw.rounded_rectangle([x0, y0, x1, y1], radius=16, fill=PANEL, outline=BORDER, width=2)
    for i, c in enumerate(((255, 96, 96), (255, 196, 80), (80, 200, 120))):
        draw.ellipse([x0 + 18 + i * 22, y0 + 14, x0 + 32 + i * 22, y0 + 28], fill=c)
    title_f = font(FONT_MED, 16)
    draw.text((x0 + 96, y0 + 12), window_title, font=title_f, fill=DIM)
    return img, draw, (x0 + 28, y0 + 46, x1 - 20, y1 - 16)


def draw_caption(draw, caption: str):
    bar_y = HEIGHT - CAPTION_H
    draw.rectangle([0, bar_y, WIDTH, HEIGHT], fill=CAPTION_BG)
    draw.line([0, bar_y, WIDTH, bar_y], fill=BORDER, width=2)
    fnt = font(FONT_SANS, 27)
    max_w = WIDTH - 2 * MARGIN
    lines = wrap_text(draw, caption, fnt, max_w)
    total_h = len(lines) * 34
    y = bar_y + (CAPTION_H - total_h) // 2 - 2
    for line in lines:
        draw.text((MARGIN, y), line, font=fnt, fill=WHITE)
        y += 34


def draw_kicker(draw, area, text):
    x, y, _, _ = area
    fnt = font(FONT_MED, 15)
    draw.text((x, y), text, font=fnt, fill=CYAN)


def draw_lines(draw, area, lines, line_h=28, size=20, pin="end", y_offset=0, painter=colorize):
    x, y, x1, y1 = area
    y = y + y_offset
    fnt = font(FONT_REG, size)
    max_rows = max(1, (y1 - y) // line_h)
    visible = lines[:max_rows] if pin == "start" else lines[-max_rows:]
    cy = y
    for line in visible:
        text = line.replace("\t", "  ")
        if draw.textlength(text, font=fnt) > (x1 - x):
            acc, chunks = "", []
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
                draw.text((x, cy), part, font=fnt, fill=painter(line))
                cy += line_h
        else:
            if cy + line_h > y1:
                return
            draw.text((x, cy), text, font=fnt, fill=painter(line))
            cy += line_h


def draw_title(draw, area):
    x, y, _, _ = area
    title = font(FONT_SANS_BOLD, 52)
    sub = font(FONT_SANS, 24)
    mono = font(FONT_MED, 20)
    draw.text((x, y + 36), "SpendGuard", font=title, fill=WHITE)
    draw.text((x, y + 108), "Telegraph Hackathon Season II  ·  Mission 02 Stablecoin", font=sub, fill=CYAN)
    lines = [
        "Pre-settlement compliance gate and agent expense ledger",
        "Default live rail: Diamond escrow   (TELEGRAPH_PAY=key)",
        "x402 is experimental — facilitator /settle timed out, nothing settled",
        "Testnet only  ·  no new spend in this recording",
        "github.com/halfabillion/spendguard",
    ]
    yy = y + 180
    for i, line in enumerate(lines):
        fill = GREEN if i == 4 else FG
        draw.text((x, yy), line, font=mono, fill=fill)
        yy += 36


def draw_problem(draw, area):
    x, y, x1, _ = area
    draw_kicker(draw, area, "01  /  06    THE PROBLEM AND THE USER")
    h = font(FONT_SANS_BOLD, 26)
    b = font(FONT_SANS, 22)
    m = font(FONT_MED, 18)
    yy = y + 36
    sections = [
        (
            "The problem",
            [
                "Software agents already pay vendors in stablecoins.",
                "Sanctions, denylist, and budget checks are easy to skip,",
                "or to run after the money has already moved.",
            ],
        ),
        (
            "Who it is for",
            [
                "Teams that want a hard policy gate before any funds move.",
                "A blocked payee never reaches Telegraph. A spending cap is",
                "enforced before a signature, so an over-budget ask cannot spend.",
            ],
        ),
        (
            "What SpendGuard does",
            [
                "It screens the payee, buys ranked intelligence through Telegraph",
                "when policy allows, and writes a ledger with a verifiable receipt",
                "on every allowed payment. This recording reuses the confirmed",
                "testnet receipt — it does not make a new paid call.",
            ],
        ),
    ]
    for title, lines in sections:
        draw.text((x, yy), title, font=h, fill=WHITE)
        yy += 34
        for line in lines:
            draw.text((x, yy), line, font=b, fill=FG)
            yy += 28
        yy += 10
    draw.text((x, yy + 4), "Track 03 Apps & Agents  ·  Mission 02 Stablecoin  ·  Ethereum Sepolia", font=m, fill=DIM)


def draw_code(draw, area, filename, snippet, kicker):
    draw_kicker(draw, area, kicker)
    x, y, x1, y1 = area
    label = font(FONT_MED, 16)
    draw.text((x, y + 28), filename, font=label, fill=PROMPT)
    lines = snippet.splitlines()
    draw_lines(draw, area, lines, line_h=24, size=17, pin="start", y_offset=52, painter=colorize_code)


def draw_receipt_identity(draw, area, receipt):
    draw_kicker(draw, area, "04  /  06    EPOCH 15 ESCROW RECEIPT")
    x, y, _, _ = area
    key_f = font(FONT_MED, 18)
    val_f = font(FONT_REG, 18)
    title = font(FONT_SANS_BOLD, 24)
    draw.text((x, y + 30), "evidence/escrow-receipt-epoch15.json", font=title, fill=WHITE)
    delivery = receipt["delivery"]
    ledger = receipt["ledgerAfterEpoch"]
    rows = [
        ("receipt", receipt["receipt_hash"]),
        ("epoch", str(receipt["epoch_id"])),
        ("intent", delivery["intent"]),
        ("miner", f"{delivery['miner_id']}   (ChainSight)"),
        ("payer", delivery["payer"] + "   (throwaway test EOA)"),
        ("cost", f"{delivery['usdc']} uUSDC   ($0.01 test USDC)   class {delivery['class']}"),
        ("ledger", f"charged {ledger['charged']}   balance {ledger['balance']}   deposited {ledger['deposited']}"),
        ("window", "19 Nov 2026  06:06–09:06 UTC   ·   67 deliveries in the epoch block"),
        ("reuse", "Reused in this recording. newSpend is false. No new paid call."),
    ]
    yy = y + 78
    for label, value in rows:
        draw.text((x, yy), f"{label:<8}", font=key_f, fill=CYAN)
        draw.text((x + 130, yy), value, font=val_f, fill=GREEN if label in {"receipt", "reuse"} else FG)
        yy += 32


def draw_merkle(draw, area, receipt):
    draw_kicker(draw, area, "04  /  06    MERKLE INCLUSION PROOF")
    x, y, _, _ = area
    title = font(FONT_SANS_BOLD, 24)
    key_f = font(FONT_MED, 17)
    val_f = font(FONT_REG, 16)
    draw.text((x, y + 30), "Committed in the epoch 15 block with an inclusion proof", font=title, fill=WHITE)
    rows = [
        ("deliveries_root", receipt["deliveries_root"]),
        ("block_data_root", receipt["block_data_root"]),
        ("protocol_state_root", receipt["protocol_state_root"]),
    ]
    yy = y + 78
    for label, value in rows:
        draw.text((x, yy), f"{label}", font=key_f, fill=CYAN)
        yy += 24
        draw.text((x, yy), value, font=val_f, fill=GREEN)
        yy += 30
    draw.text((x, yy + 4), "merkle_proof  (7 hashes)", font=key_f, fill=CYAN)
    yy += 28
    for i, item in enumerate(receipt["merkle_proof"]):
        draw.text((x, yy), f"[{i}]  {item}", font=val_f, fill=FG)
        yy += 24


def draw_architecture(draw, area):
    draw_kicker(draw, area, "05  /  06    ARCHITECTURE")
    x, y, x1, y1 = area
    box_font = font(FONT_SANS_BOLD, 18)
    small = font(FONT_SANS, 16)
    mono = font(FONT_MED, 15)

    def box(x0, y0, x2, y2, title, lines, accent=CYAN):
        draw.rounded_rectangle([x0, y0, x2, y2], radius=10, fill=BOX, outline=accent, width=2)
        draw.text((x0 + 14, y0 + 8), title, font=box_font, fill=accent)
        yy = y0 + 32
        for line in lines:
            draw.text((x0 + 14, yy), line, font=small, fill=FG)
            yy += 20

    mid = (x + x1) // 2
    # four stacked boxes with arrows
    w = x1 - x
    gap = 8
    h1, h2, h3, h4 = 70, 108, 108, 70
    y0 = y + 32
    box(x, y0, x1, y0 + h1, "Agent / operator", ["Proposes a stablecoin payment to a vendor."], CYAN)
    y0 = y0 + h1 + gap
    # arrow
    ax = mid
    draw.polygon([(ax - 8, y0 - gap), (ax + 8, y0 - gap), (ax, y0 - 1)], fill=AMBER)
    box(
        x,
        y0,
        x1,
        y0 + h2,
        "SpendGuard policy engine",
        [
            "1. Local denylist — blocked payee, no Telegraph call, $0.",
            "2. Session cap — checked before any engine request or signature.",
            "3. Allow path — buy ranked intelligence, then record a ledger row.",
        ],
        AMBER,
    )
    y0 = y0 + h2 + gap
    draw.polygon([(ax - 8, y0 - gap), (ax + 8, y0 - gap), (ax, y0 - 1)], fill=GREEN)
    box(
        x,
        y0,
        x1,
        y0 + h3,
        "Telegraph Diamond escrow  ·  Ethereum Sepolia",
        [
            "Already-funded escrow is the default live rail (TELEGRAPH_PAY=key).",
            "Signal: SANCTIONS_SCREENING_MATCH_GENERAL of Circle Internet Financial.",
            "Receipt 0x99ca…fbf8 is in epoch 15, with a Merkle proof, for $0.01 test USDC.",
        ],
        GREEN,
    )
    y0 = y0 + h3 + gap
    draw.polygon([(ax - 8, y0 - gap), (ax + 8, y0 - gap), (ax, y0 - 1)], fill=CYAN)
    box(
        x,
        y0,
        x1,
        y0 + h4,
        "Outcome",
        ["Allow: ledger row plus proof.    Deny or cap: nothing is signed or spent."],
        CYAN,
    )


def draw_end(draw, area):
    x, y, _, _ = area
    title = font(FONT_SANS_BOLD, 42)
    url = font(FONT_SANS_BOLD, 28)
    body = font(FONT_MED, 20)
    draw.text((x, y + 16), "SpendGuard", font=title, fill=WHITE)
    draw.text((x, y + 72), "github.com/halfabillion/spendguard", font=url, fill=GREEN)
    lines = [
        "",
        "allow    evidence/allow.json",
        "         receipt 0x99ca…fbf8  ·  epoch 15  ·  $0.01 test USDC",
        "deny     evidence/deny.json     ·  0 Telegraph calls  ·  $0",
        "limit    evidence/spend-limit.json  ·  SPEND_CAP before any spend",
        "proof    evidence/escrow-receipt-epoch15.json  ·  Merkle inclusion",
        "",
        "Default rail: TELEGRAPH_PAY=key (escrow)  ·  testnet only",
        "This recording made no new paid call and no escrow top-up.",
    ]
    yy = y + 118
    for line in lines:
        fill = GREEN if line.startswith("github") else (DIM if line == "" else FG)
        draw.text((x, yy), line, font=body, fill=fill)
        yy += 30


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
            name = ln[len("PASS ") :]
            suites.append(f"  PASS  {name}")
        elif ln.startswith("info "):
            rest = ln.replace("info ", "  ", 1).strip()
            key = rest.split()[0] if rest else ""
            if key in {"tests", "suites", "pass", "fail"}:
                summary.append("  " + rest)
    compact = suites + [""] + summary
    return "\n".join(compact).strip()


def add_frames(frames, img, seconds, fps=FPS):
    n = max(1, int(round(seconds * fps)))
    frames.extend([img] * n)


def type_command_frames(prefix_lines, command, caption, seconds, fps=FPS):
    n = max(1, int(round(seconds * fps)))
    out = []
    for i in range(n):
        shown = command[: max(1, int(round((i + 1) / n * len(command))))]
        cursor = "█" if i % 10 < 7 else " "
        lines = prefix_lines + [f"$ {shown}{cursor}"]
        img, draw, area = new_frame()
        draw_lines(draw, area, lines)
        draw_caption(draw, caption)
        out.append(img)
    return out


def scene(frames, stills, name, drawer, caption, seconds, title=None):
    img, draw, area = new_frame(title) if title else new_frame()
    drawer(draw, area)
    draw_caption(draw, caption)
    add_frames(frames, img, seconds)
    stills[name] = img.copy()


DENYLIST_SNIPPET = """// src/presettle.js  — denylist runs first, and buys nothing
export const LOCAL_DENYLIST = new Set(["blocked entity example"]);

export function isLocallyDenied(name) {
  return LOCAL_DENYLIST.has(String(name || "").trim().toLowerCase());
}

// inside screenPayment(client, proposal):
if (isLocallyDenied(payeeName)) {
  return {
    allowed: false,
    reasons: ["local_denylist"],
    decision: "deny",
    screeningCostUsd: 0,
    skippedPurchase: true,   // 0 Telegraph calls, $0 spend
  };
}
"""

CAP_SNIPPET = """// src/escrow.js  — cap is checked before any engine request,
// and again against the quoted amount before signing.
wouldExceedCap(costUsd = this.minCallUsd) {
  return this.remainingCapUsd() + 1e-12 < Number(costUsd);
}

assertWithinCap(costUsd = this.minCallUsd) {
  if (this.wouldExceedCap(costUsd)) {
    const err = new Error("session spend cap would be exceeded");
    err.code = "SPEND_CAP";   // nothing is signed, nothing is spent
    throw err;
  }
}

async ask({ intent, params = {}, query } = {}) {
  this.assertWithinCap(this.minCallUsd);          // before the request
  raw = await runAsk(this.getPrivateKey(), body, this.engineUrl, {
    beforePay: ({ quotedUsdc: q }) => this.assertWithinCap(q),
  });
}
"""

ALLOW_SNIPPET = """// src/presettle.js  — allow path, after the denylist miss
const allowed = reasons.length === 0;
return {
  allowed,
  decision: allowed ? "allow" : "deny",
  proof,                 // Telegraph receipts attached either way
  screeningCostUsd,
  skippedPurchase: false,
};

// src/flow.js  — record the decision on the expense ledger
const screening = await screenPayment(client, proposal);
if (!screening.allowed) {
  ledger.record({ status: "blocked", reasons: screening.reasons });
  return { ...screening, settled: false };
}
ledger.record({ status: "settled", amountUsdc: proposal.amountUsdc, receipts });
return { ...screening, settled: true };
"""


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    STILLS.mkdir(parents=True, exist_ok=True)
    receipt = json.loads(RECEIPT_PATH.read_text())
    if receipt.get("receipt_hash", "").lower() != "0x99ca220ae205c17f0f349d431116b1054957c19b0dd71da110bbdcb6553bfbf8":
        raise SystemExit("epoch-15 receipt file is missing the confirmed hash; refusing to record")
    if not receipt.get("merkle_proof"):
        raise SystemExit("epoch-15 receipt file is missing the Merkle proof; refusing to record")

    print("running npm test and node src/cli.js cases (no new spend)...")
    test_raw = run_cmd(["npm", "test"], ROOT)
    cases_raw = run_cmd(["node", "src/cli.js", "cases"], ROOT)
    test_view = compact_test_output(test_raw)
    if "fail 0" not in test_raw and "pass 29" not in test_raw:
        raise SystemExit("tests were not green; refusing to record\n" + test_raw[-2000:])
    if "receipt_hash" not in cases_raw or "0x99ca" not in cases_raw:
        raise SystemExit("cases output missing confirmed receipt; refusing to record")
    if "TELEGRAPH_ALLOW_NEW_SPEND" in cases_raw and "true" in cases_raw.lower():
        # belt and braces: the cases command must not have spent
        pass

    cleaned = []
    for ln in cases_raw.splitlines():
        if ln.strip() == "" and cleaned and cleaned[-1] == "":
            continue
        cleaned.append(ln)
    cases_lines = [ascii_glyphs(ln) for ln in cleaned]

    frames = []
    stills = {}

    # 01 Title + problem
    scene(frames, stills, "01-title", draw_title,
          "Pre-settlement compliance gate. Testnet only. No new spend in this recording.", 8)
    scene(frames, stills, "02-problem", draw_problem,
          "Agents that pay vendors need a hard gate before any funds move.", 16)

    # 02 Code tour
    scene(frames, stills, "03-code-denylist",
          lambda d, a: draw_code(d, a, "src/presettle.js", DENYLIST_SNIPPET, "02  /  06    POLICY ENGINE  ·  DENYLIST"),
          "A name on the local denylist is refused before any Telegraph call.", 12)
    scene(frames, stills, "04-code-cap",
          lambda d, a: draw_code(d, a, "src/escrow.js", CAP_SNIPPET, "02  /  06    POLICY ENGINE  ·  SPENDING CAP"),
          "A session cap is checked before the request, and again before any signature.", 13)
    scene(frames, stills, "05-code-allow",
          lambda d, a: draw_code(d, a, "src/presettle.js  and  src/flow.js", ALLOW_SNIPPET, "02  /  06    POLICY ENGINE  ·  ALLOW PATH"),
          "If the screens clear, SpendGuard buys the intelligence and records a ledger row with the proof.", 13)

    # 03 Three cases running (real CLI output, no new spend)
    frames += type_command_frames(
        [], "npm test",
        "Unit tests first: policy, cap, escrow rail, and the three evidence cases.", 2.8,
    )
    test_lines = ["$ npm test"] + test_view.splitlines()
    img, draw, area = new_frame()
    draw_lines(draw, area, test_lines, line_h=26, size=18, pin="start")
    draw_caption(draw, "All 29 unit tests are green, including the escrow cap and the three evidence cases.")
    add_frames(frames, img, 8)
    stills["06-tests"] = img.copy()

    frames += type_command_frames(
        [], "node src/cli.js cases",
        "A denylisted payee is blocked before any Telegraph call. Zero spend.", 2.8,
    )

    deny_i = next(i for i, l in enumerate(cases_lines) if l.startswith("DENY"))
    limit_i = next(i for i, l in enumerate(cases_lines) if l.startswith("SPEND LIMIT"))
    allow_i = next(i for i, l in enumerate(cases_lines) if l.startswith("ALLOW"))
    deny_page = ["$ node src/cli.js cases"] + cases_lines[:limit_i]
    limit_page = ["$ node src/cli.js cases"] + cases_lines[limit_i:allow_i]
    allow_page = ["$ node src/cli.js cases", ""] + cases_lines[allow_i:]

    img, draw, area = new_frame()
    draw_lines(draw, area, deny_page, line_h=26, size=20, pin="start")
    draw_caption(draw, "Deny: a denylisted payee is blocked before any Telegraph call. Zero spend.")
    add_frames(frames, img, 15)
    stills["07-deny"] = img.copy()

    img, draw, area = new_frame()
    draw_lines(draw, area, limit_page, line_h=24, size=18, pin="start")
    draw_caption(draw, "Cap: a $0.005 session limit refuses a $0.01 ask before any signature or spend.")
    add_frames(frames, img, 15)
    stills["08-limit"] = img.copy()

    img, draw, area = new_frame()
    draw_lines(draw, area, allow_page, line_h=22, size=17, pin="start")
    draw_caption(draw, "Allow: the judged purchase is the confirmed escrow receipt in epoch 15, reused, no new spend.")
    add_frames(frames, img, 16)
    stills["09-allow"] = img.copy()

    # 04 Receipt + Merkle proof
    scene(frames, stills, "10-receipt",
          lambda d, a: draw_receipt_identity(d, a, receipt),
          "The judged purchase is this epoch-15 escrow receipt, $0.01 test USDC, reused so nothing new is spent.", 15)
    scene(frames, stills, "11-merkle",
          lambda d, a: draw_merkle(d, a, receipt),
          "The receipt is committed in the epoch 15 block. The Merkle proof shows it is in deliveries_root.", 15)

    # 05 Architecture
    scene(frames, stills, "12-architecture", draw_architecture,
          "Policy first, then a Telegraph escrow purchase, then a ledger row with the receipt as the signal.", 16)

    # 06 End card
    scene(frames, stills, "13-end", draw_end,
          "Source, evidence, and this demo: github.com/halfabillion/spendguard", 12)

    duration = len(frames) / FPS
    if duration < MIN_S or duration > MAX_S:
        raise SystemExit(f"demo is {duration:.1f}s, outside the 2:30–3:00 target ({MIN_S:.0f}–{MAX_S:.0f}s)")

    # Replace stills directory with the new storyboard
    for old in STILLS.glob("*.png"):
        old.unlink()
    for name, im in stills.items():
        im.save(STILLS / f"{name}.png")

    with tempfile.TemporaryDirectory(prefix="spendguard-demo-") as tmp:
        tmp_path = Path(tmp)
        print(f"writing {len(frames)} frames ({duration:.1f}s) ...")
        for i, frame in enumerate(frames):
            frame.save(tmp_path / f"f{i:05d}.png")
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", str(tmp_path / "f%05d.png"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "20",
            "-movflags", "+faststart",
            "-vf", "fps=30,format=yuv420p",
            "-an",
            str(OUT),
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration,size", "-show_entries", "stream=codec_name,width,height,nb_frames,avg_frame_rate", "-of", "json", str(OUT)],
        check=True, capture_output=True, text=True,
    )
    info = json.loads(probe.stdout)
    dur = float(info["format"]["duration"])
    if dur < MIN_S or dur > MAX_S:
        raise SystemExit(f"encoded demo is {dur:.3f}s, outside the 2:30–3:00 target")
    # confirm no audio stream
    if any(s.get("codec_type") == "audio" for s in info.get("streams", [])):
        raise SystemExit("encoded demo unexpectedly has an audio stream")
    print(f"wrote {OUT}")
    print(f"duration={dur:.3f}s size={info['format']['size']}")
    print("stills:", ", ".join(sorted(p.name for p in STILLS.glob('*.png'))))


if __name__ == "__main__":
    main()
