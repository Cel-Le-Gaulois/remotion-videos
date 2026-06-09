import {
  AbsoluteFill,
  Audio,
  interpolate,
  interpolateColors,
  spring,
  staticFile,
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
  const opacity = interpolate(frame, [0, 6, 28, 36], [0, 0.6, 0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
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

const SHIMMER_START    = 4;   // frame de départ — sync son
const LETTER_OFFSET    = 4;   // décalage entre chaque lettre (frames)
const LETTER_DURATION  = 10;  // durée montée + descente par lettre (frames)
const SHIMMER_PEAK     = "#FFE0A0";

const CUTFLOW_LETTERS = [
  { char: "C", base: "#FFFFFF", group: 0 },
  { char: "u", base: "#FFFFFF", group: 0 },
  { char: "t", base: "#FFFFFF", group: 0 },
  { char: "F", base: "#F5A623", group: 1 },
  { char: "l", base: "#F5A623", group: 1 },
  { char: "o", base: "#F5A623", group: 1 },
  { char: "w", base: "#F5A623", group: 1 },
] as const;

// Couleur d'une lettre : monte vers SHIMMER_PEAK puis redescend, courbe en cloche via deux interpolateColors
const letterColor = (frame: number, index: number, base: string): string => {
  const start = SHIMMER_START + index * LETTER_OFFSET;
  const mid   = start + LETTER_DURATION / 2;
  const end   = start + LETTER_DURATION;
  if (frame < start || frame > end) return base;
  if (frame <= mid) {
    return interpolateColors(frame, [start, mid], [base, SHIMMER_PEAK]);
  }
  return interpolateColors(frame, [mid, end], [SHIMMER_PEAK, base]);
};

export const CutFlowIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title "CutFlow" — glissement rapide frames 0→4 (sync woosh ~0.15s)
  const cutX = interpolate(frame, [0, 4], [-160, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flowX = interpolate(frame, [0, 4], [160, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const titleOpacity = interpolate(frame, [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Subtitle "Video Editing" — apparaît juste après les lettres, stable avant frame 34
  const subProgress = useSpring(frame, fps, 6, 120);
  const subY = interpolate(subProgress, [0, 1], [40, 0]);
  const subOpacity = interpolate(frame, [6, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Accent line under title — se dessine dès frame 4
  const lineProgress = useSpring(frame, fps, 4, 200);
  const lineWidth = interpolate(lineProgress, [0, 1], [0, 260]);

  // Brackets — apparaissent avec les lettres
  const bracketProgress = useSpring(frame, fps, 4, 150);

  // Grid — présente immédiatement
  const gridOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Diagonal slashes — dès frame 0
  const slashProgress = useSpring(frame, fps, 0, 60);


  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
      <Audio src={staticFile("sounds/ValekStudio_cinematic_06.wav")} volume={0.5} />

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
          opacity: titleOpacity,
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
          opacity: interpolate(frame, [18, 28], [0, 0.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
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
