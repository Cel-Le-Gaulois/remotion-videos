import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Audio,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { loadFont as loadBungee } from "@remotion/google-fonts/Bungee";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily: TITLE_FONT } = loadBungee();
const { fontFamily: MONO_FONT } = loadMono("normal", { weights: ["400", "700"], subsets: ["latin"] });

// ── Charte CutFlow ──────────────────────────────────────────────────────────
const BG = "#0A0A0A";
const ACCENT = "#00FF41";
const DIM = "#8A8A8A";

// ── Mise en page 1080x1920, tout dans la zone sûre TikTok / Reels ───────────
// Zone sûre : x 86 → 940 (droite 140 px), y 200 → 1586 (bas 334 px).
// v2 : l'APRÈS est grand et neutre (pas de halo vert sur l'image) pour qu'on voie le travail ;
// l'AVANT est une petite vignette en haut. Le Matrix reste dans le décor, jamais sur les vidéos.
// v6 (12 oct.) : l'APRÈS prend toute la hauteur utile (+32 % de surface en largeur, moins de flou après
// recompression Instagram) ; l'AVANT devient une vignette en bas à droite, posée sur la zone que le Reel
// lui-même laisse vide (zone des boutons Instagram), donc sans cacher de sous-titre ni de carte.
const layout = (avantHorizontal: boolean) => {
  const top = 300;
  const h = 1570 - top; // 1270
  const w = Math.round((h * 9) / 16); // 714
  const apres = { x: Math.round(513 - w / 2), y: top, w, h };
  const avant = avantHorizontal ? { x: 560, y: 1350, w: 380, h: 214 } : { x: 760, y: 1210, w: 180, h: 320 };
  return { avant, apres };
};

const INTRO = 10; // frame du flash d'entrée (les vidéos démarrent dès la frame 0)

// ── Props réglables depuis le Studio ────────────────────────────────────────
export const avantApresSchema = z.object({
  avant: z.string(), // chemin dans /public, ex. "AvantApres/client1_avant.mp4"
  apres: z.string(),
  dureeSecondes: z.number().min(1).max(90),
  niveau: z.string(), // ex. "PACK BASIC", "PACK MOTION"
  son: z.enum(["apres", "avant"]),
  pseudo: z.string(),
  nomAvant: z.string(),
  nomApres: z.string(),
  sfx: z.string(), // son d'entrée dans /public (vide = aucun)
  sfxDecalage: z.number(), // secondes de silence en tête du fichier à sauter
  sousAvant: z.string(), // petit texte sous AVANT, ex. "rush brut", "vidéo YouTube 16:9"
  sousApres: z.string(), // petit texte sous APRÈS
  avantEntier: z.boolean(), // true = vidéo horizontale affichée entière (bandes noires) dans la carte AVANT
  fps: z.number().optional(), // v7 (20 oct.) : cadence des vidéos (25 pour les Reels Valek, 30 pour le Reel seed phrase)
});
export type AvantApresProps = z.infer<typeof avantApresSchema>;

export const avantApresDefaults: AvantApresProps = {
  avant: "AvantApres/test_avant.mp4",
  apres: "AvantApres/test_apres.mp4",
  dureeSecondes: 12,
  niveau: "PACK BASIC",
  son: "apres",
  pseudo: "@cutflow_video",
  nomAvant: "rush_brut.mp4",
  nomApres: "cutflow_edit.mp4",
  sfx: "",
  sfxDecalage: 0,
  sousAvant: "rush brut",
  sousApres: "version montée",
  avantEntier: false,
};

// Durée de la compo = durée des vidéos
export const calculateAvantApresMetadata: CalculateMetadataFunction<AvantApresProps> = ({ props }) => ({
  durationInFrames: Math.round(props.dureeSecondes * (props.fps ?? 25)),
  fps: props.fps ?? 25, // les Reels HyperFrames sont en 25 i/s (cadence d'origine) : pas de conversion, pas de saccade
});

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// Hash déterministe (pas de Math.random : rendu identique à chaque export)
const hash = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+=<>?/".split("");
const glyph = (a: number, b: number) => GLYPHS[Math.floor(hash(a, b) * GLYPHS.length) % GLYPHS.length];

// Mot qui se « décode » lettre par lettre
const decode = (word: string, frame: number, start: number, step: number) =>
  word
    .split("")
    .map((ch, i) => (ch === " " || frame >= start + i * step ? ch : glyph(frame + 1, i + 7)))
    .join("");

// Glitch bref toutes les ~3 s (enveloppe 0 → 1 → 0 sur 4 frames)
const glitchAt = (frame: number, offset: number) => {
  const t = (frame + offset) % 90;
  return t < 4 ? [0.6, 1, 1, 0.4][t] : 0;
};

// ── Fond : pluie Matrix discrète + grille + scanlines ───────────────────────
const COLS = 24;
const RAIN = Array.from({ length: COLS }, (_, i) => ({
  x: (i + 0.5) * (1080 / COLS),
  // v6 : pluie plus lente et plus discrète (moins de pixels qui changent = plus de débit pour le visage)
  speed: 2 + hash(i, 1) * 3.5,
  offset: hash(i, 2) * 1920,
  len: 8 + Math.floor(hash(i, 3) * 14),
  op: 0.03 + hash(i, 4) * 0.05,
}));

const MatrixRain: React.FC<{ frame: number }> = ({ frame }) => (
  <AbsoluteFill style={{ overflow: "hidden" }}>
    {RAIN.map((c, i) => {
      const headY = ((c.offset + frame * c.speed) % 2400) - 300;
      return Array.from({ length: c.len }, (_, k) => {
        const y = headY - k * 34;
        if (y < -40 || y > 1960) return null;
        const head = k === 0;
        return (
          <div
            key={`${i}-${k}`}
            style={{
              position: "absolute",
              left: c.x - 10,
              top: y,
              fontFamily: MONO_FONT,
              fontSize: 26,
              color: head ? "#C8FFD4" : ACCENT,
              opacity: c.op * (1 - k / c.len) * (head ? 2.2 : 1),
            }}
          >
            {glyph(Math.floor(frame / 12) + k * 13, i)}
          </div>
        );
      });
    })}
  </AbsoluteFill>
);

const Grid: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage: `linear-gradient(${ACCENT}0D 1px, transparent 1px), linear-gradient(90deg, ${ACCENT}0D 1px, transparent 1px)`,
      backgroundSize: "60px 60px",
    }}
  />
);

const Scanlines: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0px, rgba(0,0,0,0.25) 1px, transparent 1px, transparent 4px)",
      pointerEvents: "none",
    }}
  />
);

// ── Carte vidéo ─────────────────────────────────────────────────────────────
const Brackets: React.FC<{ color: string }> = ({ color }) => {
  const s = 34;
  const t = 5;
  const off = -14;
  const corner = (fx: boolean, fy: boolean, key: number) => (
    <div key={key} style={{ position: "absolute", width: s, height: s, [fx ? "right" : "left"]: off, [fy ? "bottom" : "top"]: off }}>
      <div style={{ position: "absolute", width: s, height: t, background: color, [fy ? "bottom" : "top"]: 0 }} />
      <div style={{ position: "absolute", width: t, height: s, background: color, [fx ? "right" : "left"]: 0 }} />
    </div>
  );
  return <>{[corner(false, false, 0), corner(true, false, 1), corner(false, true, 2), corner(true, true, 3)]}</>;
};

const Card: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  muted: boolean;
  accent: boolean;
  enter: number; // frame d'entrée
  frame: number;
  fit?: "cover" | "contain";
}> = ({ x, y, w, h, src, muted, accent, enter, frame, fit = "cover" }) => {
  // Révélation par balayage vertical à l'entrée (aucun effet sur l'image ensuite)
  const reveal = interpolate(frame, [enter, enter + 10], [0, 100], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        clipPath: `inset(-30px -30px ${((100 - reveal) / 100) * (h + 60) - 30}px -30px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: accent ? 26 : 14,
          overflow: "hidden",
          border: accent ? "5px solid #FFFFFF" : `3px solid ${DIM}`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.75)",
          background: "#000",
        }}
      >
        <OffthreadVideo src={staticFile(src)} muted={muted} style={{ width: "100%", height: "100%", objectFit: fit }} />
      </div>
      {accent && <Brackets color={ACCENT} />}
    </div>
  );
};

// ── Étiquette AVANT / APRÈS ─────────────────────────────────────────────────
const Label: React.FC<{
  text: string;
  sub: string;
  cx: number;
  cy: number;
  accent: boolean;
  frame: number;
  start: number;
  size?: number;
}> = ({ text, sub, cx, cy, accent, frame, start, size = 88 }) => {
  const color = accent ? ACCENT : "#FFFFFF";
  const op = interpolate(frame, [start, start + 4], [0, 1], clamp);
  const g = glitchAt(frame, accent ? 20 : 65);
  const shown = decode(text, frame, start, 3);
  const base: React.CSSProperties = {
    fontFamily: TITLE_FONT,
    fontSize: size,
    lineHeight: 1,
    whiteSpace: "nowrap",
    textAlign: "center",
  };
  return (
    <div style={{ position: "absolute", left: cx - 190, top: cy - size * 0.75, width: 380, opacity: op }}>
      <div style={{ position: "relative" }}>
        {g > 0 && (
          <>
            <div style={{ ...base, position: "absolute", inset: 0, color: "#FF0033", transform: `translateX(${-8 * g}px)`, mixBlendMode: "screen" }}>{shown}</div>
            <div style={{ ...base, position: "absolute", inset: 0, color: "#00B7FF", transform: `translateX(${8 * g}px)`, mixBlendMode: "screen" }}>{shown}</div>
          </>
        )}
        <div style={{ ...base, color, textShadow: accent ? `0 0 28px ${ACCENT}AA` : "none" }}>{shown}</div>
      </div>
      <div
        style={{
          marginTop: 18,
          textAlign: "center",
          fontFamily: MONO_FONT,
          fontSize: 24,
          color: accent ? ACCENT : DIM,
          opacity: interpolate(frame, [start + 12, start + 18], [0, 0.9], clamp),
        }}
      >
        {`> ${sub}`}
        <span style={{ opacity: Math.floor(frame / 12) % 2 ? 1 : 0 }}>_</span>
      </div>
    </div>
  );
};

// ── Composition ─────────────────────────────────────────────────────────────
export const AvantApres: React.FC<AvantApresProps> = (props) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const L = layout(props.avantEntier);


  // Flash vert à l'entrée, quand les vidéos démarrent
  const flash = interpolate(frame, [INTRO - 1, INTRO, INTRO + 6], [0, 0.35, 0], clamp);
  // Fondu au noir sur les 8 dernières frames
  const outro = interpolate(frame, [durationInFrames - 8, durationInFrames], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: BG, overflow: "hidden" }}>
      {props.sfx !== "" && (
        <Audio src={staticFile(props.sfx)} startFrom={Math.round(props.sfxDecalage * fps)} volume={0.6} />
      )}
      <MatrixRain frame={frame} />
      {/* textures de fond : sous les cartes, jamais sur les vidéos */}
      <Scanlines />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.7) 100%)`, pointerEvents: "none" }} />
      <AbsoluteFill style={{ background: ACCENT, opacity: flash, pointerEvents: "none" }} />
      <Grid />

      {/* Bandeau du haut (sous la zone des onglets TikTok, y ≥ 200) */}
      <div
        style={{
          position: "absolute",
          top: 222,
          left: 110,
          right: 140,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: MONO_FONT,
          fontSize: 24,
          color: ACCENT,
          opacity: interpolate(frame, [0, 6], [0, 0.9], clamp),
        }}
      >
        <span>{decode("CUTFLOW://BEFORE_AFTER", frame, 0, 1)}</span>
        <span style={{ color: "#FFFFFF" }}>{props.pseudo}</span>
      </div>

      <Card {...L.apres} src={props.apres} muted={props.son !== "apres"} accent enter={0} frame={frame} />

      {/* v6 : AVANT en vignette par-dessus le coin bas droit de l'APRÈS, avec son badge */}
      <Card {...L.avant} src={props.avant} muted={props.son !== "avant"} accent={false} enter={6} frame={frame} fit="cover" />
      {(() => {
        const s1 = interpolate(frame, [12, 18], [0, 1], clamp);
        return (
          <div style={{ position: "absolute", left: L.avant.x + 16, top: L.avant.y - 30, display: "flex", alignItems: "center", gap: 10, background: "#FFFFFF", borderRadius: 10, padding: "6px 14px 4px", boxShadow: "0 8px 20px rgba(0,0,0,0.5)", transform: `scale(${s1})`, transformOrigin: "left center" }}>
            <span style={{ fontFamily: TITLE_FONT, fontSize: 32, lineHeight: 1, color: "#0A0A0A" }}>{decode("AVANT", frame, 12, 2)}</span>
            <span style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 18, color: "#0A0A0A" }}>{props.sousAvant}</span>
          </div>
        );
      })()}

      {/* Badge APRÈS posé sur le bord haut de la grande carte */}
      {(() => {
        const s2 = interpolate(frame, [10, 16], [0, 1], clamp);
        return (
          <div style={{ position: "absolute", left: L.apres.x + 26, top: L.apres.y - 34, display: "flex", alignItems: "center", gap: 14, background: ACCENT, borderRadius: 14, padding: "8px 18px 6px", boxShadow: "0 10px 24px rgba(0,0,0,0.5)", transform: `scale(${s2})`, transformOrigin: "left center" }}>
            <span style={{ fontFamily: TITLE_FONT, fontSize: 46, lineHeight: 1, color: "#0A0A0A" }}>{decode("APRÈS", frame, 10, 2)}</span>
            <span style={{ fontFamily: MONO_FONT, fontWeight: 700, fontSize: 24, color: "#0A0A0A" }}>{props.niveau}</span>
          </div>
        );
      })()}

      <AbsoluteFill style={{ background: "#000", opacity: outro, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
