import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const ACCENT = "#F5A623";
const BG = "#0A0A0A";

const useSpring = (frame: number, fps: number, delay: number, stiffness = 100) =>
  spring({ frame: frame - delay, fps, config: { stiffness, damping: 18, mass: 1 } });

// Thin horizontal scan line that sweeps down once
const ScanLine: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const progress = spring({ frame: frame - 5, fps, config: { stiffness: 40, damping: 20 } });
  const y = interpolate(progress, [0, 1], [-10, 110]);
  const opacity = interpolate(frame, [5, 15, 140, 160], [0, 0.6, 0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: `${y}%`,
        height: 2,
        background: `linear-gradient(90deg, transparent 0%, ${ACCENT} 30%, ${ACCENT} 70%, transparent 100%)`,
        opacity,
        filter: "blur(1px)",
      }}
    />
  );
};

// Corner bracket accent marks
const CornerBrackets: React.FC<{ progress: number }> = ({ progress }) => {
  const size = 36;
  const thick = 3;
  const gap = 80;
  const opacity = interpolate(progress, [0, 1], [0, 0.9]);
  const scale = interpolate(progress, [0, 1], [0.6, 1]);

  const corners: [number, number, number, number][] = [
    [gap, gap, 0, 0],
    [gap, gap, 0, 1],
    [gap, gap, 1, 0],
    [gap, gap, 1, 1],
  ];

  return (
    <>
      {corners.map(([cx, cy, flipX, flipY], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: flipX ? undefined : cx,
            right: flipX ? cx : undefined,
            top: flipY ? undefined : cy,
            bottom: flipY ? cy : undefined,
            width: size,
            height: size,
            opacity,
            transform: `scale(${scale})`,
            transformOrigin: flipX
              ? flipY ? "right bottom" : "right top"
              : flipY ? "left bottom" : "left top",
          }}
        >
          {/* horizontal arm */}
          <div
            style={{
              position: "absolute",
              top: flipY ? undefined : 0,
              bottom: flipY ? 0 : undefined,
              left: flipX ? undefined : 0,
              right: flipX ? 0 : undefined,
              width: size,
              height: thick,
              background: ACCENT,
            }}
          />
          {/* vertical arm */}
          <div
            style={{
              position: "absolute",
              top: flipY ? undefined : 0,
              bottom: flipY ? 0 : undefined,
              left: flipX ? undefined : 0,
              right: flipX ? 0 : undefined,
              width: thick,
              height: size,
              background: ACCENT,
            }}
          />
        </div>
      ))}
    </>
  );
};

// Background grid of very faint lines
const GridLines: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      opacity: opacity * 0.18,
      backgroundImage: `
        linear-gradient(${ACCENT}55 1px, transparent 1px),
        linear-gradient(90deg, ${ACCENT}55 1px, transparent 1px)
      `,
      backgroundSize: "80px 80px",
    }}
  />
);

// Diagonal slash decorations
const DiagonalSlashes: React.FC<{ progress: number }> = ({ progress }) => {
  const scaleY = interpolate(progress, [0, 1], [0, 1]);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {[-1, 0, 1].map((offset) => (
        <div
          key={offset}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 2,
            height: 900,
            background: `linear-gradient(to bottom, transparent, ${ACCENT}44 50%, transparent)`,
            transform: `translateX(${offset * 260}px) translateY(-50%) rotate(25deg) scaleY(${scaleY})`,
            transformOrigin: "center top",
            opacity: 0.5,
          }}
        />
      ))}
    </div>
  );
};

// ── Shimmer helpers ────────────────────────────────────────────────────────

const SHIMMER_START = 90;   // première frame du shimmer
const SHIMMER_PERIOD = 60;  // répétition toutes les 2 s (30 fps)
const LETTER_OFFSET = 4;    // décalage entre chaque lettre (frames)
const LETTER_DURATION = 10; // durée d'un scintillement par lettre (frames)
const SHIMMER_PEAK = "#FFE0A0";

// Lettre, couleur de base, groupe d'animation d'entrée (0=Cut, 1=Flow)
const CUTFLOW_LETTERS = [
  { char: "C", base: "#FFFFFF", group: 0 },
  { char: "u", base: "#FFFFFF", group: 0 },
  { char: "t", base: "#FFFFFF", group: 0 },
  { char: "F", base: "#F5A623", group: 1 },
  { char: "l", base: "#F5A623", group: 1 },
  { char: "o", base: "#F5A623", group: 1 },
  { char: "w", base: "#F5A623", group: 1 },
] as const;

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const lerpColor = (from: string, to: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
};

// Retourne la couleur courante d'une lettre selon sa position dans le cycle
const letterColor = (frame: number, index: number, base: string): string => {
  if (frame < SHIMMER_START) return base;
  const cycleFrame = (frame - SHIMMER_START) % SHIMMER_PERIOD;
  const local = cycleFrame - index * LETTER_OFFSET;
  if (local < 0 || local >= LETTER_DURATION) return base;
  // Courbe en cloche : monte puis redescend symétriquement
  const t = Math.sin((local / LETTER_DURATION) * Math.PI);
  return lerpColor(base, SHIMMER_PEAK, t);
};

// textShadow d'un glow doux qui suit le shimmer
const letterGlow = (frame: number, index: number, base: string): string => {
  if (frame < SHIMMER_START) return base === "#FFFFFF" ? `0 0 60px ${ACCENT}66` : `0 0 80px ${ACCENT}99`;
  const cycleFrame = (frame - SHIMMER_START) % SHIMMER_PERIOD;
  const local = cycleFrame - index * LETTER_OFFSET;
  const t = (local >= 0 && local < LETTER_DURATION)
    ? Math.sin((local / LETTER_DURATION) * Math.PI)
    : 0;
  const glowColor = lerpColor(ACCENT, SHIMMER_PEAK, t);
  const spread = base === "#FFFFFF" ? 60 + t * 20 : 80 + t * 20;
  return `0 0 ${spread}px ${glowColor}${base === "#FFFFFF" ? "99" : "cc"}`;
};

export const CutFlowIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title "CutFlow" — word reveal: "Cut" slides in from left, "Flow" from right
  const cutSlide = useSpring(frame, fps, 8, 120);
  const flowSlide = useSpring(frame, fps, 18, 120);

  const cutX = interpolate(cutSlide, [0, 1], [-160, 0]);
  const flowX = interpolate(flowSlide, [0, 1], [160, 0]);

  const titleOpacity = interpolate(frame, [8, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Subtitle "Video Editing"
  const subProgress = useSpring(frame, fps, 38, 80);
  const subY = interpolate(subProgress, [0, 1], [40, 0]);
  const subOpacity = interpolate(frame, [38, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Accent line under title
  const lineProgress = useSpring(frame, fps, 30, 90);
  const lineWidth = interpolate(lineProgress, [0, 1], [0, 260]);

  // Brackets appear with title
  const bracketProgress = useSpring(frame, fps, 25, 60);

  // Grid fades in early
  const gridOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Diagonal slashes
  const slashProgress = useSpring(frame, fps, 2, 30);

  // Global vignette/glow pulse
  const glowPulse = Math.sin((frame / fps) * Math.PI * 2) * 0.08 + 0.92;

  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
      {/* Grid */}
      <GridLines opacity={gridOpacity} />

      {/* Diagonal slash lines */}
      <DiagonalSlashes progress={slashProgress} />

      {/* Scan line sweep */}
      <ScanLine frame={frame} fps={fps} />

      {/* Radial glow behind title */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -55%)",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${ACCENT}22 0%, transparent 70%)`,
          opacity: titleOpacity * glowPulse,
        }}
      />

      {/* Corner brackets */}
      <CornerBrackets progress={bracketProgress} />

      {/* ── Title ── */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        {/* "CutFlow" — chaque lettre a son propre shimmer séquencé */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "baseline",
            opacity: titleOpacity,
          }}
        >
          {/* Groupe "Cut" — animation d'entrée depuis la gauche */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "baseline",
              transform: `translateX(${cutX}px)`,
            }}
          >
            {CUTFLOW_LETTERS.filter((l) => l.group === 0).map((l, i) => (
              <span
                key={l.char + i}
                style={{
                  fontFamily: "'Arial Black', 'Arial', sans-serif",
                  fontSize: 148,
                  fontWeight: 900,
                  letterSpacing: -4,
                  lineHeight: 1,
                  display: "inline-block",
                  color: letterColor(frame, i, l.base),
                  textShadow: letterGlow(frame, i, l.base),
                }}
              >
                {l.char}
              </span>
            ))}
          </div>

          {/* Groupe "Flow" — animation d'entrée depuis la droite */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "baseline",
              transform: `translateX(${flowX}px)`,
            }}
          >
            {CUTFLOW_LETTERS.filter((l) => l.group === 1).map((l, i) => (
              <span
                key={l.char + i}
                style={{
                  fontFamily: "'Arial Black', 'Arial', sans-serif",
                  fontSize: 148,
                  fontWeight: 900,
                  letterSpacing: -4,
                  lineHeight: 1,
                  display: "inline-block",
                  color: letterColor(frame, i + 3, l.base),
                  textShadow: letterGlow(frame, i + 3, l.base),
                }}
              >
                {l.char}
              </span>
            ))}
          </div>
        </div>

        {/* Accent divider line */}
        <div
          style={{
            height: 3,
            width: lineWidth,
            background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`,
            borderRadius: 2,
            marginTop: 8,
            marginBottom: 28,
            boxShadow: `0 0 12px ${ACCENT}`,
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            opacity: subOpacity,
            transform: `translateY(${subY}px)`,
          }}
        >
          <div style={{ width: 40, height: 1, background: `${ACCENT}99` }} />
          <span
            style={{
              fontFamily: "'Arial', sans-serif",
              fontSize: 38,
              fontWeight: 300,
              color: "#C8C8C8",
              letterSpacing: 12,
              textTransform: "uppercase",
            }}
          >
            Video Editing
          </span>
          <div style={{ width: 40, height: 1, background: `${ACCENT}99` }} />
        </div>
      </AbsoluteFill>

      {/* Bottom brand tag */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: interpolate(frame, [50, 65], [0, 0.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <span
          style={{
            fontFamily: "'Arial', sans-serif",
            fontSize: 22,
            letterSpacing: 6,
            color: ACCENT,
            textTransform: "uppercase",
          }}
        >
          ✦ Premium Cuts ✦
        </span>
      </div>
    </AbsoluteFill>
  );
};
