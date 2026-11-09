import React from "react";
import {
  AbsoluteFill,
  Audio,
  CalculateMetadataFunction,
  Freeze,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadEmoji } from "@remotion/google-fonts/NotoColorEmoji";
import clipsData from "./clips.json";

const { fontFamily: MONTSERRAT } = loadMontserrat("normal", { weights: ["800"], subsets: ["latin", "latin-ext"] });
const { fontFamily: POPPINS } = loadPoppins("normal", { weights: ["900"], subsets: ["latin", "latin-ext"] });
const { fontFamily: MONO } = loadMono("normal", { weights: ["500", "800"], subsets: ["latin", "latin-ext"] });
const { fontFamily: EMOJI } = loadEmoji();

// ── Réglages généraux ───────────────────────────────────────────────────────
const FPS = 30;
const GREEN = "#00FF41";
const YELLOW = "#FFD400";
// Zone sûre TikTok / Reels : x 86 → 940, y 200 → 1586
const SUB_LEFT = 103;
const SUB_WIDTH = 820;

type Word = { w: string; s: number; e: number };
type ClipData = { words: Word[]; keep: [number, number][]; cuts: number[]; end: number };
const CLIPS = clipsData as unknown as Record<string, ClipData>;

export const reelSchema = z.object({
  clip: z.enum(["A", "B", "C"]),
  niveau: z.enum(["basic", "inter", "premium"]),
});
export type ReelProps = z.infer<typeof reelSchema>;

// ── Contenu éditorial par clip ──────────────────────────────────────────────
type Broll = { src: string; from: number; to: number; skip?: number };
type Sfx = { src: string; at: number; lead: number; vol: number };
type ClipConfig = {
  keywords: string[];
  emojis: Record<string, string>; // mot (sans ponctuation, minuscule) -> emoji
  broll: Broll[];
  hook?: { lines: string[]; emoji?: string; to: number };
};

const norm = (w: string) =>
  w
    .toLowerCase()
    .replace(/[.,?!:; ]/g, "")
    .trim();

const CONFIG: Record<string, ClipConfig> = {
  A: { keywords: [], emojis: {}, broll: [] },
  B: {
    keywords: [
      "insatisfait", "bonheur", "dopamine", "neuronales", "poisson", "rouge", "parents", "téléphone",
      "pause", "d'écran", "continuer", "avancer", "innover", "projets", "compétences", "avenir", "sport", "vivre", "réalité",
    ],
    emojis: { insatisfait: "😩", dopamine: "🧠", avancer: "🚀", projets: "💡", compétences: "📚", réalité: "🌍" },
    broll: [
      { src: "Reels/broll/br_35147318.mp4", from: 8.85, to: 9.8 },
      { src: "Reels/broll/br_7580118.mp4", from: 9.8, to: 11.8 },
      { src: "Reels/broll/br_10374888.mp4", from: 14.5, to: 16.3 },
      { src: "Reels/broll/br_31916834.mp4", from: 20.8, to: 22.85 },
      { src: "Reels/broll/br_6388436.mp4", from: 25.8, to: 26.62, skip: 1.5 },
      { src: "Reels/broll/br_3125907.mp4", from: 27.45, to: 99 },
    ],
    hook: { lines: ["TU AS L'ATTENTION", "D'UN POISSON ROUGE ?"], emoji: "🐟", to: 2.4 },
  },
  C: {
    keywords: ["fous", "daron", "twerker", "likes", "seuls", "intime", "consommer", "encore", "swipe", "pods", "casque", "virtuel"],
    emojis: {},
    broll: [{ src: "Reels/broll/br_6611945.mp4", from: 14.55, to: 16.45 }],
  },
};

// ── Temps : le montage retire des silences, on remappe source -> sortie ─────
const buildTimeline = (keep: [number, number][]) => {
  let acc = 0;
  return keep.map(([s, e]) => {
    const fromF = acc;
    const len = Math.round((e - s) * FPS);
    acc += len;
    return { s, e, fromF, len };
  });
};
const toOutFrame = (tl: ReturnType<typeof buildTimeline>, t: number) => {
  for (const k of tl) {
    if (t < k.s) return k.fromF; // dans un silence coupé -> début du morceau suivant
    if (t <= k.e) return k.fromF + Math.round((t - k.s) * FPS);
  }
  const last = tl[tl.length - 1];
  return last.fromF + last.len;
};

// Hash déterministe (aucun Math.random : rendu identique à chaque export)
const hash = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+=<>?/";
const scramble = (text: string, frame: number, progress: number) =>
  text
    .split("")
    .map((ch, i) => {
      if (ch === " " || i / Math.max(1, text.length) < progress) return ch;
      return GLYPHS[Math.floor(hash(frame + 3, i + 11) * GLYPHS.length)];
    })
    .join("");

const TAIL: Record<ReelProps["niveau"], number> = { basic: 0, inter: 0, premium: 36 };

export const calculateReelMetadata: CalculateMetadataFunction<ReelProps> = ({ props }) => {
  const tl = buildTimeline(CLIPS[props.clip].keep);
  const last = tl[tl.length - 1];
  return { durationInFrames: last.fromF + last.len + TAIL[props.niveau], fps: FPS };
};

// ── Sous-titres : découpage en groupes de mots ──────────────────────────────
type Chunk = { words: (Word & { outF: number; outE: number })[]; startF: number; endF: number };
const buildChunks = (words: Word[], tl: ReturnType<typeof buildTimeline>, maxWords: number, maxChars: number, totalF: number) => {
  const mapped = words.map((w) => ({ ...w, outF: toOutFrame(tl, w.s), outE: toOutFrame(tl, w.e) }));
  const chunks: Chunk[] = [];
  let cur: typeof mapped = [];
  const flush = () => {
    if (cur.length) chunks.push({ words: cur, startF: cur[0].outF, endF: 0 });
    cur = [];
  };
  mapped.forEach((w, i) => {
    const chars = cur.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length;
    if (cur.length && (cur.length >= maxWords || chars > maxChars)) flush();
    cur.push(w);
    const next = mapped[i + 1];
    const punct = /[.,?!:;]$/.test(w.w);
    const gap = next ? next.s - w.e : 0;
    if (punct || gap > 0.35) flush();
  });
  flush();
  chunks.forEach((c, i) => {
    const lastW = c.words[c.words.length - 1];
    const nextStart = chunks[i + 1]?.startF ?? totalF;
    c.endF = Math.min(nextStart, lastW.outE + 12);
  });
  return chunks;
};

// ── Zoom par plan (« coupes, zooms simples ») ───────────────────────────────
const useZoom = (frame: number, shots: number[], niveau: ReelProps["niveau"], punchFrames: number[]) => {
  let idx = 0;
  for (let i = 0; i < shots.length; i++) if (frame >= shots[i]) idx = i;
  const shotStart = shots[idx];
  const base = idx % 2 === 1 ? (niveau === "basic" ? 1.1 : 1.14) : 1.0;
  if (niveau === "basic") return base;
  const push = interpolate(frame - shotStart, [0, 120], [0, 0.035], { extrapolateRight: "clamp" });
  let punch = 0;
  for (const p of punchFrames) {
    if (frame >= p && frame < p + 14) punch = Math.max(punch, interpolate(frame - p, [0, 3, 14], [0, 0.05, 0]));
  }
  return base + push + punch;
};

// ── Couches graphiques ──────────────────────────────────────────────────────
const MatrixRain: React.FC<{ frame: number; opacity: number; cols?: number }> = ({ frame, opacity, cols = 22 }) => (
  <AbsoluteFill style={{ opacity, pointerEvents: "none", overflow: "hidden" }}>
    {Array.from({ length: cols }, (_, i) => {
      const speed = 9 + hash(i, 1) * 12;
      const len = 10 + Math.floor(hash(i, 3) * 14);
      const headY = ((hash(i, 2) * 1920 + frame * speed) % 2600) - 400;
      return Array.from({ length: len }, (_, k) => {
        const y = headY - k * 38;
        if (y < -40 || y > 1960) return null;
        return (
          <div
            key={`${i}-${k}`}
            style={{
              position: "absolute",
              left: (i + 0.5) * (1080 / cols) - 12,
              top: y,
              fontFamily: MONO,
              fontWeight: 800,
              fontSize: 30,
              color: k === 0 ? "#D8FFE0" : GREEN,
              opacity: (1 - k / len) * (k === 0 ? 1 : 0.7),
              textShadow: `0 0 8px ${GREEN}`,
            }}
          >
            {GLYPHS[Math.floor(hash(Math.floor(frame / 2) + k * 7, i) * GLYPHS.length)]}
          </div>
        );
      });
    })}
  </AbsoluteFill>
);

const Scanlines: React.FC<{ opacity: number }> = ({ opacity }) => (
  <AbsoluteFill
    style={{
      opacity,
      pointerEvents: "none",
      backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 2px, transparent 2px, transparent 5px)",
    }}
  />
);

const HudFrame: React.FC<{ frame: number }> = ({ frame }) => {
  const s = 46;
  const t = 4;
  const corners: [boolean, boolean][] = [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {corners.map(([fx, fy], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: fx ? undefined : 96,
            right: fx ? 150 : undefined,
            top: fy ? undefined : 300,
            bottom: fy ? 360 : undefined,
            width: s,
            height: s,
            opacity: 0.75,
            borderColor: GREEN,
            borderStyle: "solid",
            borderWidth: `${fy ? 0 : t}px ${fx ? t : 0}px ${fy ? t : 0}px ${fx ? 0 : t}px`,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 236,
          fontFamily: MONO,
          fontWeight: 800,
          fontSize: 26,
          color: GREEN,
          textShadow: `0 0 10px ${GREEN}`,
          display: "flex",
          gap: 14,
          alignItems: "center",
        }}
      >
        <span style={{ opacity: Math.floor(frame / 15) % 2 ? 1 : 0.2 }}>●</span>
        <span>REC</span>
      </div>
    </AbsoluteFill>
  );
};

const DopamineBar: React.FC<{ frame: number; total: number }> = ({ frame, total }) => {
  const p = interpolate(frame, [0, total - 40], [0.18, 1], { extrapolateRight: "clamp" });
  const cells = 12;
  const on = Math.round(p * cells);
  return (
    <div
      style={{
        position: "absolute",
        right: 150,
        top: 232,
        fontFamily: MONO,
        fontWeight: 800,
        fontSize: 26,
        color: GREEN,
        textShadow: `0 0 10px ${GREEN}`,
        textAlign: "right",
      }}
    >
      {"DOPAMINE "}
      <span style={{ letterSpacing: 1 }}>{"▮".repeat(on)}</span>
      <span style={{ opacity: 0.25, letterSpacing: 1 }}>{"▮".repeat(cells - on)}</span>
      {` ${Math.round(p * 100)}%`}
    </div>
  );
};

// ── Composition ─────────────────────────────────────────────────────────────
export const Reel: React.FC<ReelProps> = ({ clip, niveau }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const data = CLIPS[clip];
  const cfg = CONFIG[clip];
  const src = `Reels/apres_src_${clip}.mp4`;
  const tl = buildTimeline(data.keep);
  const speechEnd = tl[tl.length - 1].fromF + tl[tl.length - 1].len;
  const out = (t: number) => toOutFrame(tl, t);
  const prem = niveau === "premium";
  const inter = niveau !== "basic";

  // Plans : coupes détectées + raccords de silences coupés
  const shots = Array.from(new Set([0, ...data.cuts.map(out), ...tl.map((k) => k.fromF)])).sort((a, b) => a - b);

  // Mots-clés : début de mot (pour les zooms « punch » et les SFX)
  const kwWords = data.words.filter((w) => cfg.keywords.includes(norm(w.w)));
  const punchFrames = inter ? kwWords.map((w) => out(w.s)) : [];
  const zoom = useZoom(frame, shots, niveau, punchFrames);

  // Glitch aux coupes (premium)
  const glitchAmt = prem
    ? Math.max(0, ...shots.slice(1).map((c) => (frame >= c && frame < c + 4 ? [1, 0.7, 0.4, 0.15][frame - c] : 0)))
    : 0;

  // Swipe (premium, clip C) : la vidéo « défile » vers le haut au mot swipe
  const swipeWord = prem ? data.words.find((w) => norm(w.w) === "swipe") : undefined;
  const swipeF = swipeWord ? out(swipeWord.s) : -999;
  const swipeY =
    frame >= swipeF && frame < swipeF + 10
      ? interpolate(frame - swipeF, [0, 4, 5, 10], [0, -520, 520, 0])
      : 0;

  // Fin premium : pluie Matrix qui envahit l'image
  const podsWord = prem ? data.words.find((w) => norm(w.w) === "casque") : undefined;
  const takeoverF = podsWord ? out(podsWord.s) : 99999;
  const rainOpacity = prem
    ? Math.max(
        interpolate(frame, [out(19.6), takeoverF], [0, 0.45], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        interpolate(frame, [takeoverF, takeoverF + 10], [0.45, 0.85], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      )
    : 0;

  const chunks = buildChunks(
    data.words,
    tl,
    niveau === "basic" ? 4 : 3,
    niveau === "basic" ? 22 : niveau === "inter" ? 16 : 18,
    speechEnd,
  );
  const chunk = chunks.find((c) => frame >= c.startF && frame < c.endF);

  // ── SFX ──
  const sfx: Sfx[] = [];
  if (inter) {
    cfg.broll.forEach((b) => sfx.push({ src: "Reels/sfx/whoosh.mp3", at: out(b.from), lead: 0.56, vol: 0.32 }));
    data.words.forEach((w) => {
      if (cfg.emojis[norm(w.w)]) sfx.push({ src: "Reels/sfx/pop.wav", at: out(w.s), lead: 0.125, vol: 0.45 });
    });
    if (cfg.hook) sfx.push({ src: "Reels/sfx/whoosh.mp3", at: 2, lead: 0.56, vol: 0.3 });
  }
  if (clip === "B" && inter) {
    const pause = data.words.find((w) => norm(w.w) === "pause");
    const cont = data.words.find((w) => norm(w.w) === "continuer");
    if (pause) sfx.push({ src: "Reels/sfx/pop.wav", at: out(pause.s), lead: 0.125, vol: 0.55 });
    if (cont) sfx.push({ src: "Reels/sfx/pop.wav", at: out(cont.s), lead: 0.125, vol: 0.55 });
  }
  if (prem) {
    sfx.push({ src: "Reels/sfx/glitch.mp3", at: 2, lead: 0.33, vol: 0.4 });
    shots.slice(1).forEach((c, i) => {
      if (i % 2 === 0) sfx.push({ src: "Reels/sfx/glitch_short.mp3", at: c, lead: 0, vol: 0.22 });
    });
    const likes = data.words.find((w) => norm(w.w) === "likes");
    if (likes) [0, 5, 10, 16].forEach((d) => sfx.push({ src: "Reels/sfx/pop.wav", at: out(likes.s) + d, lead: 0.125, vol: 0.35 }));
    if (swipeWord) sfx.push({ src: "Reels/sfx/whoosh.mp3", at: swipeF + 4, lead: 0.56, vol: 0.45 });
    cfg.broll.forEach((b) => sfx.push({ src: "Reels/sfx/data.wav", at: out(b.from), lead: 0, vol: 0.22 }));
    sfx.push({ src: "Reels/sfx/riser.mp3", at: takeoverF, lead: 7.12, vol: 0.22 });
    sfx.push({ src: "Reels/sfx/impact.mp3", at: takeoverF, lead: 1.01, vol: 0.55 });
    sfx.push({ src: "Reels/sfx/bip.wav", at: speechEnd + 8, lead: 0, vol: 0.3 });
  }

  // ── Sous-titres ──
  const renderSubs = () => {
    if (!chunk) return null;
    const local = frame - chunk.startF;
    const activeIdx = chunk.words.findIndex((w, i) => frame >= w.outF && (i === chunk.words.length - 1 || frame < chunk.words[i + 1].outF));
    const emoji = inter ? chunk.words.map((w) => cfg.emojis[norm(w.w)]).find(Boolean) : undefined;
    const emojiWord = chunk.words.find((w) => cfg.emojis[norm(w.w)]);

    if (niveau === "basic") {
      return (
        <div style={{ position: "absolute", left: SUB_LEFT, width: SUB_WIDTH, top: 1190, textAlign: "center" }}>
          <span
            style={{
              fontFamily: MONTSERRAT,
              fontWeight: 800,
              fontSize: 72,
              lineHeight: 1.12,
              color: "#FFFFFF",
              WebkitTextStroke: "11px #000",
              paintOrder: "stroke fill",
            }}
          >
            {chunk.words.map((w) => w.w).join(" ")}
          </span>
        </div>
      );
    }

    if (niveau === "inter") {
      const pop = spring({ frame: local, fps: FPS, config: { damping: 12, stiffness: 220 } });
      const eLocal = emojiWord ? frame - emojiWord.outF : -1;
      const ePop = eLocal >= 0 ? spring({ frame: eLocal, fps: FPS, config: { damping: 9, stiffness: 180 } }) : 0;
      return (
        <>
          {emoji && eLocal >= 0 && (
            <div
              style={{
                position: "absolute",
                left: SUB_LEFT,
                width: SUB_WIDTH,
                top: 1040,
                textAlign: "center",
                fontFamily: EMOJI,
                fontSize: 120,
                transform: `scale(${ePop}) rotate(${(1 - ePop) * -25}deg)`,
              }}
            >
              {emoji}
            </div>
          )}
          <div
            style={{
              position: "absolute",
              left: SUB_LEFT,
              width: SUB_WIDTH,
              top: 1200,
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              columnGap: 18,
              transform: `scale(${0.82 + 0.18 * pop})`,
            }}
          >
            {chunk.words.map((w, i) => {
              const active = i === activeIdx;
              const kw = cfg.keywords.includes(norm(w.w));
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    marginRight: i < chunk.words.length - 1 ? 22 : 0,
                    fontFamily: POPPINS,
                    fontWeight: 900,
                    fontSize: 86,
                    lineHeight: 1.08,
                    textTransform: "uppercase",
                    color: active || kw ? YELLOW : "#FFFFFF",
                    WebkitTextStroke: "12px #000",
                    paintOrder: "stroke fill",
                    textShadow: "0 8px 0 rgba(0,0,0,0.6)",
                    transform: `scale(${active ? 1.1 : 1})`,
                  }}
                >
                  {w.w}
                  {i < chunk.words.length - 1 ? "\u00a0" : ""}
                </span>
              );
            })}
          </div>
        </>
      );
    }

    // premium : terminal Matrix
    const progress = interpolate(local, [0, 7], [0, 1], { extrapolateRight: "clamp" });
    return (
      <div style={{ position: "absolute", left: SUB_LEFT, width: SUB_WIDTH, top: 1190, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            background: "rgba(5,10,5,0.78)",
            border: `2px solid ${GREEN}66`,
            borderLeft: `8px solid ${GREEN}`,
            padding: "16px 26px",
            boxShadow: `0 0 30px ${GREEN}33`,
            textAlign: "center",
            maxWidth: SUB_WIDTH,
          }}
        >
          {chunk.words.map((w, i) => {
            const active = i === activeIdx;
            const kw = cfg.keywords.includes(norm(w.w));
            const txt = scramble(w.w.toUpperCase(), frame, progress * 1.3 - i * 0.15);
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  margin: "4px 10px",
                  padding: kw ? "0 10px" : 0,
                  fontFamily: MONO,
                  fontWeight: 800,
                  fontSize: 64,
                  lineHeight: 1.15,
                  background: kw ? GREEN : "transparent",
                  color: kw ? "#000" : active ? GREEN : "#E8FFE8",
                  textShadow: kw ? "none" : active ? `0 0 18px ${GREEN}` : "none",
                }}
              >
                {txt}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Vidéo principale (morceaux gardés) ──
  const videoLayer = (
    <AbsoluteFill
      style={{
        transform: `translateY(${swipeY}px) scale(${zoom}) translateX(${glitchAmt * (hash(frame, 5) - 0.5) * 40}px)`,
        transformOrigin: "50% 30%",
        filter: glitchAmt > 0 ? `hue-rotate(${glitchAmt * 60}deg) contrast(${1 + glitchAmt * 0.4})` : undefined,
      }}
    >
      {tl.map((k, i) => (
        <Sequence key={i} from={k.fromF} durationInFrames={k.len} layout="none">
          <OffthreadVideo src={staticFile(src)} startFrom={Math.round(k.s * FPS)} style={{ width: 1080, height: 1920 }} />
        </Sequence>
      ))}
      {TAIL[niveau] > 0 && (
        <Sequence from={speechEnd} layout="none">
          <Freeze frame={Math.round(tl[tl.length - 1].e * FPS) - 2}>
            <OffthreadVideo src={staticFile(src)} muted style={{ width: 1080, height: 1920 }} />
          </Freeze>
        </Sequence>
      )}
    </AbsoluteFill>
  );

  // ── B-roll ──
  const brollLayer = inter
    ? cfg.broll.map((b, i) => {
        const f0 = out(b.from);
        const f1 = Math.min(out(b.to), speechEnd + TAIL[niveau]);
        const local = frame - f0;
        const enter = interpolate(local, [0, 6], [1.18, 1], { extrapolateRight: "clamp" });
        const fade = interpolate(frame, [f1 - 4, f1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <Sequence key={i} from={f0} durationInFrames={Math.max(1, f1 - f0)} layout="none">
            <AbsoluteFill style={{ transform: `scale(${enter})`, opacity: b.to > 90 ? 1 : fade }}>
              <OffthreadVideo
                src={staticFile(b.src)}
                muted
                startFrom={Math.round((b.skip ?? 0) * FPS)}
                style={{
                  width: 1080,
                  height: 1920,
                  objectFit: "cover",
                  filter: prem ? "grayscale(0.6) sepia(0.3) hue-rotate(60deg) saturate(2.2) contrast(1.15) brightness(0.9)" : undefined,
                }}
              />
              {prem && <Scanlines opacity={0.6} />}
            </AbsoluteFill>
          </Sequence>
        );
      })
    : null;

  // ── Icônes pause / lecture (clip B, inter) ──
  const iconLayer = () => {
    if (clip !== "B" || !inter) return null;
    const pause = data.words.find((w) => norm(w.w) === "pause");
    const cont = data.words.find((w) => norm(w.w) === "continuer");
    const items: { f: number; dur: number; kind: "pause" | "play" }[] = [];
    if (pause) items.push({ f: out(pause.s), dur: out(14.5) - out(pause.s), kind: "pause" });
    if (cont) items.push({ f: out(cont.s), dur: 22, kind: "play" });
    return items.map((it, i) => {
      const l = frame - it.f;
      if (l < 0 || l >= it.dur) return null;
      const s = spring({ frame: l, fps: FPS, config: { damping: 10, stiffness: 200 } });
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 513 - 110,
            top: 560,
            width: 220,
            height: 220,
            borderRadius: 110,
            background: "rgba(0,0,0,0.55)",
            border: "6px solid #fff",
            transform: `scale(${s})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 26,
          }}
        >
          {it.kind === "pause" ? (
            <>
              <div style={{ width: 30, height: 100, background: "#fff", borderRadius: 6 }} />
              <div style={{ width: 30, height: 100, background: "#fff", borderRadius: 6 }} />
            </>
          ) : (
            <div style={{ width: 0, height: 0, marginLeft: 18, borderTop: "56px solid transparent", borderBottom: "56px solid transparent", borderLeft: `92px solid #fff` }} />
          )}
        </div>
      );
    });
  };

  // ── Accroche (inter) ──
  const hookLayer = () => {
    if (niveau !== "inter" || !cfg.hook) return null;
    const endF = out(cfg.hook.to);
    if (frame >= endF) return null;
    const s = spring({ frame, fps: FPS, config: { damping: 11, stiffness: 180 } });
    const outS = interpolate(frame, [endF - 5, endF], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
      <div style={{ position: "absolute", left: SUB_LEFT, width: SUB_WIDTH, top: 1385, display: "flex", justifyContent: "center", transform: `scale(${s * outS}) rotate(-2deg)` }}>
        <div style={{ background: "#fff", borderRadius: 22, padding: "18px 30px", boxShadow: "0 12px 0 rgba(0,0,0,0.35)", textAlign: "center" }}>
          {cfg.hook.lines.map((l, i) => (
            <div key={i} style={{ fontFamily: POPPINS, fontWeight: 900, fontSize: 60, lineHeight: 1.1, color: "#111" }}>
              {l}
              {i === cfg.hook!.lines.length - 1 && cfg.hook!.emoji ? <span style={{ fontFamily: EMOJI, marginLeft: 12 }}>{cfg.hook!.emoji}</span> : null}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Habillage premium ──
  const premiumLayer = () => {
    if (!prem) return null;
    const likes = data.words.find((w) => norm(w.w) === "likes");
    const likesF = likes ? out(likes.s) : -999;
    const lLocal = frame - likesF;
    const introOn = frame < 60;
    const introProg = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
    const flash = interpolate(frame, [takeoverF, takeoverF + 2, takeoverF + 12], [0, 0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const endLocal = frame - speechEnd;
    return (
      <>
        <MatrixRain frame={frame} opacity={rainOpacity} />
        <Scanlines opacity={0.18} />
        <HudFrame frame={frame} />
        <DopamineBar frame={frame} total={durationInFrames} />

        {/* Intro terminal */}
        {introOn && (
          <div
            style={{
              position: "absolute",
              left: SUB_LEFT,
              width: SUB_WIDTH,
              top: 300,
              display: "flex",
              justifyContent: "center",
              opacity: interpolate(frame, [48, 60], [1, 0], { extrapolateLeft: "clamp" }),
            }}
          >
            <div style={{ background: "rgba(0,0,0,0.8)", border: `2px solid ${GREEN}`, padding: "14px 24px", fontFamily: MONO, fontWeight: 800, color: GREEN, textShadow: `0 0 12px ${GREEN}` }}>
              <div style={{ fontSize: 40 }}>{scramble("> RESEAUX_SOCIAUX.EXE", frame, introProg)}</div>
              <div style={{ fontSize: 28, opacity: 0.85, marginTop: 6 }}>
                {scramble("CHARGEMENT DU CERVEAU", frame, interpolate(frame, [10, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }))}
                <span style={{ opacity: Math.floor(frame / 8) % 2 }}>_</span>
              </div>
            </div>
          </div>
        )}

        {/* Likes qui explosent */}
        {lLocal >= 0 && lLocal < 34 &&
          Array.from({ length: 9 }, (_, i) => {
            const t = lLocal - i * 2;
            if (t < 0) return null;
            const x = 180 + hash(i, 4) * 520;
            const y = 1050 - t * (14 + hash(i, 6) * 10);
            const op = interpolate(t, [0, 4, 22, 30], [0, 1, 1, 0], { extrapolateRight: "clamp" });
            return (
              <div key={i} style={{ position: "absolute", left: x, top: y, fontSize: 70 + hash(i, 7) * 40, color: GREEN, opacity: op, textShadow: `0 0 16px ${GREEN}`, fontFamily: MONO }}>
                ♥
              </div>
            );
          })}
        {lLocal >= 0 && lLocal < 34 && (
          <div
            style={{
              position: "absolute",
              left: SUB_LEFT,
              width: SUB_WIDTH,
              top: 1085,
              textAlign: "center",
              fontFamily: MONO,
              fontWeight: 800,
              fontSize: 56,
              color: GREEN,
              textShadow: `0 0 18px ${GREEN}`,
              transform: `scale(${spring({ frame: lLocal, fps: FPS, config: { damping: 10 } })})`,
            }}
          >
            {`+${Math.round(interpolate(lLocal, [0, 24], [12, 1287], { extrapolateRight: "clamp" })).toLocaleString("fr-FR")} ♥`}
          </div>
        )}

        {/* Flèche swipe */}
        {frame >= swipeF - 4 && frame < swipeF + 22 && (
          <div
            style={{
              position: "absolute",
              left: 513 - 70,
              top: interpolate(frame - swipeF, [-4, 22], [900, 640]),
              width: 140,
              textAlign: "center",
              fontFamily: MONO,
              fontWeight: 800,
              color: GREEN,
              textShadow: `0 0 16px ${GREEN}`,
              opacity: interpolate(frame - swipeF, [-4, 0, 16, 22], [0, 1, 1, 0]),
            }}
          >
            <div style={{ fontSize: 110, lineHeight: 1 }}>↑</div>
            <div style={{ fontSize: 30 }}>SWIPE</div>
          </div>
        )}

        <AbsoluteFill style={{ background: GREEN, opacity: flash, mixBlendMode: "screen", pointerEvents: "none" }} />

        {/* Fin : déconnexion impossible */}
        {endLocal >= 0 && (
          <div style={{ position: "absolute", left: SUB_LEFT, width: SUB_WIDTH, top: 880, display: "flex", justifyContent: "center" }}>
            <div style={{ background: "rgba(0,0,0,0.85)", border: `3px solid ${GREEN}`, padding: "20px 28px", fontFamily: MONO, fontWeight: 800, color: GREEN, textShadow: `0 0 14px ${GREEN}`, textAlign: "center" }}>
              <div style={{ fontSize: 44 }}>{scramble("> DÉCONNEXION", frame, interpolate(endLocal, [0, 10], [0, 1], { extrapolateRight: "clamp" }))}</div>
              <div style={{ fontSize: 44 }}>
                {scramble("IMPOSSIBLE", frame, interpolate(endLocal, [8, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }))}
                <span style={{ opacity: Math.floor(frame / 8) % 2 }}>_</span>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const fadeOut = interpolate(frame, [durationInFrames - 6, durationInFrames], [0, 1], { extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {videoLayer}
      {brollLayer}
      {prem && <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, transparent 50%, rgba(0,20,5,0.75) 100%)` }} />}
      {premiumLayer()}
      {iconLayer()}
      {hookLayer()}
      {renderSubs()}
      {sfx.map((s, i) => {
        const startF = s.at - Math.round(s.lead * FPS);
        return (
          <Sequence key={`sfx${i}`} from={Math.max(0, startF)} layout="none">
            <Audio src={staticFile(s.src)} volume={s.vol} startFrom={startF < 0 ? -startF : 0} />
          </Sequence>
        );
      })}
      <AbsoluteFill style={{ background: "#000", opacity: fadeOut, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
