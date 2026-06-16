import {
  AbsoluteFill,
  Audio,
  interpolate,
  interpolateColors,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Bungee";

const { fontFamily } = loadFont();

const BG = "#0A0A0A";
const ACCENT = "#F5A623";
const BOOM = 47; // frame du gros impact, synchro avec le son

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

// Hash déterministe (style GLSL) : positions stables d'un frame à l'autre,
// indispensable pour un rendu MP4 reproductible (pas de Math.random()).
const hash = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ── Éléments de fond ────────────────────────────────────────────────────────

type Particle = { x: number; baseY: number; size: number; speed: number; op: number };

const PARTICLES: Particle[] = Array.from({ length: 30 }, (_, i) => ({
  x: hash(i, 1) * 100,
  baseY: hash(i, 2) * 100,
  size: 2 + hash(i, 3) * 4,
  speed: 0.3 + hash(i, 4) * 0.9,
  op: 0.1 + hash(i, 5) * 0.22,
}));

// Particules sombres qui dérivent très lentement vers le haut
const DriftParticles: React.FC<{ frame: number; visibility: number }> = ({ frame, visibility }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {PARTICLES.map((p, i) => {
      const y = (((p.baseY - frame * p.speed * 0.04) % 100) + 100) % 100;
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${y}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: ACCENT,
            opacity: p.op * visibility,
            filter: "blur(1px)",
          }}
        />
      );
    })}
  </AbsoluteFill>
);

const STREAKS = Array.from({ length: 6 }, (_, i) => ({
  x: hash(i, 7) * 100,
  len: 140 + hash(i, 8) * 240,
  speed: 0.5 + hash(i, 9) * 0.7,
  op: 0.04 + hash(i, 10) * 0.06,
}));

// Fines lignes verticales discrètes qui descendent (ambiance orage lointain)
const DriftStreaks: React.FC<{ frame: number; visibility: number }> = ({ frame, visibility }) => (
  <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
    {STREAKS.map((s, i) => {
      const y = (((-20 + frame * s.speed * 0.06) % 120) + 120) % 120;
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${s.x}%`,
            top: `${y - 20}%`,
            width: 1,
            height: s.len,
            background: `linear-gradient(to bottom, transparent, ${ACCENT}, transparent)`,
            opacity: s.op * visibility,
          }}
        />
      );
    })}
  </AbsoluteFill>
);

// Particules projetées depuis le centre au moment du boum.
// Tout est dérivé d'un hash déterministe -> rendu MP4 identique à chaque fois.
type Burst = {
  angle: number;   // direction d'éjection (radians)
  dist: number;    // distance max atteinte (px)
  tau: number;     // constante de décélération (frames)
  size: number;    // taille (px)
  op: number;      // opacité de base
  fall: number;    // gravité / retombée
  driftAmp: number;
  driftSpeed: number;
  phase: number;
};

const BURSTS: Burst[] = Array.from({ length: 30 }, (_, i) => {
  // Angle réparti tout autour, légèrement perturbé pour éviter la régularité
  const angle = (i / 30) * Math.PI * 2 + (hash(i, 21) - 0.5) * 0.5;
  return {
    angle,
    dist: 360 + hash(i, 22) * 560,
    tau: 9 + hash(i, 23) * 8,
    size: 2 + hash(i, 24) * 4,
    op: 0.3 + hash(i, 25) * 0.45,
    fall: 14 + hash(i, 26) * 26,
    driftAmp: 10 + hash(i, 27) * 22,
    driftSpeed: 0.25 + hash(i, 28) * 0.5,
    phase: hash(i, 29) * Math.PI * 2,
  };
});

const BurstParticles: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  if (frame < BOOM) return null;
  const t = frame - BOOM;          // frames depuis le boum
  const ts = t / fps;              // secondes depuis le boum
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {BURSTS.map((p, i) => {
        // Éjection qui décélère : approche dist en ralentissant (ease-out exponentiel)
        const d = p.dist * (1 - Math.exp(-t / p.tau));
        // Retombée douce + dérive organique
        const dx = Math.cos(p.angle) * d + Math.sin(ts * p.driftSpeed + p.phase) * p.driftAmp;
        const dy =
          Math.sin(p.angle) * d +
          p.fall * ts +                       // gravité lente
          Math.cos(ts * p.driftSpeed + p.phase) * p.driftAmp * 0.6;
        // Fondu d'entrée au boum, léger estompage vers la fin
        const opacity =
          p.op *
          interpolate(frame, [BOOM, BOOM + 4], [0, 1], clamp) *
          interpolate(frame, [BOOM, 240, 300], [1, 1, 0.65], clamp);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: p.size,
              height: p.size,
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              borderRadius: "50%",
              background: ACCENT,
              opacity,
              transform: `translate(${dx}px, ${dy}px)`,
              boxShadow: `0 0 ${p.size * 1.5}px ${ACCENT}`,
              filter: "blur(0.4px)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// Onde de choc : deux anneaux qui se propagent du centre vers les bords
const Shockwave: React.FC<{ frame: number }> = ({ frame }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {[0, 9].map((delay, idx) => {
      const t = interpolate(frame, [BOOM + delay, BOOM + delay + 58], [0, 1], clamp);
      if (t <= 0 || t >= 1) return null;
      const size = interpolate(t, [0, 1], [40, 2600]);
      const opacity = interpolate(t, [0, 0.12, 1], [0, 0.7, 0]) * (idx === 0 ? 1 : 0.45);
      const borderWidth = interpolate(t, [0, 1], [12, 1]);
      return (
        <div
          key={idx}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: size,
            height: size,
            marginLeft: -size / 2,
            marginTop: -size / 2,
            borderRadius: "50%",
            border: `${borderWidth}px solid ${ACCENT}`,
            opacity,
          }}
        />
      );
    })}
  </AbsoluteFill>
);

// Crochets de coin discrets aux quatre coins (apparaissent au boum)
const CornerBrackets: React.FC<{ opacity: number }> = ({ opacity }) => {
  const size = 56;
  const thick = 4;
  const margin = 90;

  // [flipX, flipY] pour chacun des quatre coins
  const corners: [number, number][] = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ];

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {corners.map(([flipX, flipY], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: flipX ? undefined : margin,
            right: flipX ? margin : undefined,
            top: flipY ? undefined : margin,
            bottom: flipY ? margin : undefined,
            width: size,
            height: size,
            opacity,
          }}
        >
          {/* bras horizontal */}
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
          {/* bras vertical */}
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
    </AbsoluteFill>
  );
};

// ── Composition ──────────────────────────────────────────────────────────────

export const ThunderIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Reveal du titre : reste sombre/flou pendant la montée, explose à la frame 47.
  const titleOpacity = interpolate(frame, [0, 12], [0, 1], clamp);
  const titleBlur = interpolate(frame, [0, 38, BOOM], [24, 6, 0], clamp);
  const cutColor = interpolateColors(frame, [0, 44, BOOM + 1], ["#0E0E0E", "#2E2E2E", "#FFFFFF"]);
  const flowColor = interpolateColors(frame, [0, 44, BOOM + 1], ["#0E0E0E", "#2A2012", ACCENT]);

  // Présence + coup de "punch" net au moment du boum
  const baseScale = interpolate(frame, [0, BOOM], [0.9, 1], clamp);
  const punch = interpolate(frame, [BOOM - 1, BOOM + 1, BOOM + 14], [0, 1, 0], clamp);
  const titleScale = baseScale + punch * 0.05;

  // Respiration lumineuse lente après le boum (~5,5s par cycle)
  const breathe = frame > BOOM ? (Math.sin(((frame - BOOM) / fps) * Math.PI * 2 * 0.18) + 1) / 2 : 0;
  const glowOn = interpolate(frame, [BOOM - 2, BOOM + 6], [0, 1], clamp);
  const glow = glowOn * (0.55 + breathe * 0.45);

  // Flash plein cadre à l'impact
  const flash = interpolate(frame, [BOOM - 2, BOOM, BOOM + 12], [0, 0.55, 0], clamp);

  // Halo radial derrière le titre (s'allume au boum, puis respire)
  const haloOpacity = glowOn * (0.35 + breathe * 0.25);

  // Trait d'accent sous le titre
  const lineWidth = interpolate(frame, [BOOM, 72], [0, 300], clamp);
  const lineOpacity = interpolate(frame, [BOOM, 62], [0, 1], clamp);

  // Sous-titre "VIDEO EDITING" — fondu vers la frame 70
  const subOpacity = interpolate(frame, [62, 82], [0, 1], clamp);
  const subY = interpolate(frame, [62, 82], [18, 0], clamp);

  // Tag "PREMIUM CUTS" — apparaît tout en bas vers la frame 250
  const tagOpacity = interpolate(frame, [244, 266], [0, 0.65], clamp);
  const tagY = interpolate(frame, [244, 266], [16, 0], clamp);

  // Particules : plus présentes au moment du boum, puis s'estompent doucement
  const particleVis = interpolate(frame, [0, BOOM, 110], [0.5, 1, 0.45], clamp);

  // Crochets de coin : fondu d'entrée au boum, puis restent jusqu'à la fin
  const bracketOpacity = interpolate(frame, [BOOM, BOOM + 8], [0, 0.85], clamp);

  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
      <Audio src={staticFile("Sounds/thunder_intro.mp3")} volume={0.7} />

      {/* Fond : particules + fines lignes qui dérivent */}
      <DriftParticles frame={frame} visibility={particleVis} />
      <DriftStreaks frame={frame} visibility={particleVis} />

      {/* Halo radial derrière le titre */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 1100,
          height: 1100,
          marginLeft: -550,
          marginTop: -640,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${ACCENT}55 0%, transparent 65%)`,
          opacity: haloOpacity,
        }}
      />

      {/* Onde de choc */}
      <Shockwave frame={frame} />

      {/* Particules projetées au boum (derrière le titre) */}
      <BurstParticles frame={frame} fps={fps} />

      {/* Crochets de coin */}
      <CornerBrackets opacity={bracketOpacity} />

      {/* ── Titre ── */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "baseline",
            opacity: titleOpacity,
            transform: `scale(${titleScale})`,
            filter: `blur(${titleBlur}px)`,
            textShadow: `0 0 ${glow * 45}px rgba(245, 166, 35, ${glow * 0.55})`,
            fontFamily,
            fontSize: 150,
            fontWeight: 400,
            letterSpacing: 0,
            lineHeight: 1,
          }}
        >
          <span style={{ color: cutColor }}>Cut</span>
          <span style={{ color: flowColor }}>Flow</span>
        </div>

        {/* Trait d'accent */}
        <div
          style={{
            height: 4,
            width: lineWidth,
            background: ACCENT,
            borderRadius: 2,
            marginTop: 6,
            marginBottom: 30,
            opacity: lineOpacity,
            boxShadow: `0 0 14px ${ACCENT}`,
          }}
        />

        {/* Sous-titre */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            opacity: subOpacity,
            transform: `translateY(${subY}px)`,
          }}
        >
          <div style={{ width: 48, height: 1, background: `${ACCENT}99` }} />
          <span
            style={{
              fontFamily: "Arial, sans-serif",
              fontSize: 40,
              fontWeight: 300,
              color: "#D0D0D0",
              letterSpacing: 16,
              textTransform: "uppercase",
            }}
          >
            Video Editing
          </span>
          <div style={{ width: 48, height: 1, background: `${ACCENT}99` }} />
        </div>
      </AbsoluteFill>

      {/* Tag bas */}
      <div
        style={{
          position: "absolute",
          bottom: 140,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: tagOpacity,
          transform: `translateY(${tagY}px)`,
        }}
      >
        <span
          style={{
            fontFamily: "Arial, sans-serif",
            fontSize: 26,
            letterSpacing: 8,
            color: ACCENT,
            textTransform: "uppercase",
          }}
        >
          ✦ Premium Cuts ✦
        </span>
      </div>

      {/* Flash d'impact (gradient sur un div, jamais sur du texte) */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle, #FFFFFF 0%, ${ACCENT} 100%)`,
          opacity: flash,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
