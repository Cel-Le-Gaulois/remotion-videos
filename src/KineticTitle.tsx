import { loadFont } from "@remotion/google-fonts/Inter";
import { zColor, zTextarea } from "@remotion/zod-types";
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";

/**
 * Titres animés génériques (kinetic typography).
 * Aucune marque, tout est pilotable depuis le panneau Props, et le fond peut
 * rester réellement transparent pour un export en overlay alpha.
 */

/* ════════════════════════════════════════════════════════════════════════════
   POLICE
   Inter est chargée ici et sert de valeur par défaut à `fontFamily`.
   Le prop reste libre : la pile CSS retombe sur Inter puis sur la sans système
   si la police demandée n'est pas disponible.
   Pour proposer une autre Google Font, remplace l'import par par ex.
   `@remotion/google-fonts/Montserrat` (déjà installé).
   ════════════════════════════════════════════════════════════════════════════ */
const { fontFamily: LOADED_FONT } = loadFont("normal", {
  weights: ["400", "600", "700", "800", "900"],
  subsets: ["latin"],
});

/* ════════════════════════════════════════════════════════════════════════════
   TIMINGS — tout se règle ici, les durées de compo en découlent
   ════════════════════════════════════════════════════════════════════════════ */

/** Durée de la sortie animée, par élément (frames) */
const OUT_DURATION = 12;
/** Décalage entre éléments à la sortie — plus serré qu'à l'entrée, ça claque */
const OUT_STAGGER = 1.5;
/** Marge ajoutée en fin de compo pour ne pas couper la dernière frame */
const TAIL_FRAMES = 6;
/**
 * charStagger enchaîne bien plus d'éléments que les autres presets :
 * son décalage est ramené à cette fraction de `staggerFrames`.
 */
const CHAR_STAGGER_RATIO = 0.5;

/* ── Amplitudes par preset ─────────────────────────────────────────────── */

/** wordsUp : hauteur de la montée (px) */
const WORDS_UP_RISE = 40;
/** wordsUp : remontée supplémentaire à la sortie (px) */
const WORDS_UP_EXIT = 26;
/** charStagger : échelle de départ de chaque lettre */
const CHAR_SCALE_FROM = 0.8;
/** lineSlide : distance d'entrée latérale (px) */
const LINE_SLIDE_IN = 220;
/** lineSlide : distance de sortie latérale (px), dans le sens de la lancée */
const LINE_SLIDE_OUT = 140;
/** scaleBlur : échelle de départ (punch-in) */
const SCALE_BLUR_FROM = 1.15;
/** scaleBlur : flou de départ (px) */
const SCALE_BLUR_PX = 12;
/**
 * scaleBlur : le flou atteint 0 avant la fin de l'animation, sinon le texte
 * reste mou trop longtemps. 1.35 = net à ~74 % de la course.
 */
const SCALE_BLUR_SHARPEN = 1.35;
/** glitch : durée du parasitage au début de chaque mot (frames) */
const GLITCH_FRAMES = 7;
/** glitch : décalage RGB max (px) */
const GLITCH_SHIFT_PX = 14;
/** glitch : le motif change tous les N frames (plus grand = plus saccadé) */
const GLITCH_STEP = 2;
/** glitch : hauteur max des bandes de découpe (fraction de la hauteur du mot) */
const GLITCH_CLIP = 0.35;
/** glitch : couleurs des deux copies décalées (aberration chromatique) */
const GLITCH_RED = "#FF0044";
const GLITCH_CYAN = "#00E5FF";

/* ── Mise en page ──────────────────────────────────────────────────────── */

/** Hauteur de ligne — assez haute pour que maskReveal ne rogne pas les jambages */
const LINE_HEIGHT = 1.14;
/** Espace entre les mots (em) */
const WORD_GAP_EM = 0.28;
/** Marge latérale du bloc de texte (% de la largeur) */
const SIDE_PADDING = "7%";

/* ── Courbes ───────────────────────────────────────────────────────────── */

/** "Expo out" : départ franc, arrivée douce. Jamais de linéaire. */
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
/** Sortie : part doucement puis accélère */
const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);
/** Ressort d'entrée : léger dépassement, pour que le mot se "pose" */
const SPRING_CONFIG = { damping: 14, mass: 0.7, stiffness: 110 };

const CLAMP = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

/* ════════════════════════════════════════════════════════════════════════════
   SCHEMA
   ════════════════════════════════════════════════════════════════════════════ */

export const PRESETS = [
  "wordsUp",
  "maskReveal",
  "charStagger",
  "lineSlide",
  "scaleBlur",
  "glitch",
] as const;

export const kineticTitleSchema = z.object({
  /** Les retours à la ligne sont respectés (une ligne = un bloc animé) */
  text: zTextarea(),
  preset: z.enum(PRESETS),
  fontFamily: z.string(),
  fontWeight: z.number().int().min(100).max(900).step(100),
  fontSizePx: z.number().min(8).max(400),
  textColor: zColor(),
  accentColor: zColor(),
  /** Indices des mots à passer en accentColor, comptés sur tout le texte, 0-based */
  accentWords: z.array(z.number().int().min(0)),
  /** 'transparent' pour un overlay alpha, ou n'importe quelle couleur CSS */
  background: z.string(),
  align: z.enum(["left", "center", "right"]),
  staggerFrames: z.number().min(0).max(30),
  animDurationFrames: z.number().min(1).max(120),
  holdFrames: z.number().min(0).max(600),
  animateOut: z.boolean(),
});

export type KineticTitleProps = z.infer<typeof kineticTitleSchema>;

export const kineticTitleDefaults: KineticTitleProps = {
  // ~11 caractères par ligne : au-delà, 130 px déborde de la largeur utile en 1080
  text: "TITRE ANIMÉ\nEN 2 LIGNES",
  preset: "wordsUp",
  fontFamily: LOADED_FONT,
  fontWeight: 800,
  fontSizePx: 130,
  textColor: "#FFFFFF",
  accentColor: "#F5A623",
  accentWords: [],
  background: "transparent",
  align: "center",
  staggerFrames: 3,
  animDurationFrames: 18,
  holdFrames: 40,
  animateOut: true,
};

/* ════════════════════════════════════════════════════════════════════════════
   DÉCOUPE DU TEXTE
   ════════════════════════════════════════════════════════════════════════════ */

type ParsedWord = {
  text: string;
  /** Index du mot sur l'ensemble du texte (c'est celui que vise accentWords) */
  wordIndex: number;
  /** Index de la 1re lettre du mot sur l'ensemble du texte */
  charStart: number;
};

type ParsedLine = { words: ParsedWord[]; lineIndex: number };

const parseText = (text: string): ParsedLine[] => {
  let wordIndex = 0;
  let charStart = 0;

  return text.split("\n").map((raw, lineIndex) => {
    const words = raw
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => {
        const parsed = { text: word, wordIndex, charStart };
        wordIndex += 1;
        charStart += word.length;
        return parsed;
      });
    return { words, lineIndex };
  });
};

/** Les presets qui animent la ligne entière plutôt que chaque mot */
const isLinePreset = (preset: KineticTitleProps["preset"]) =>
  preset === "maskReveal" || preset === "lineSlide";

/** Nombre d'éléments animés : c'est lui qui fixe la longueur de l'entrée */
const unitCount = (props: KineticTitleProps): number => {
  const lines = parseText(props.text);
  if (isLinePreset(props.preset)) {
    return Math.max(1, lines.length);
  }
  const words = lines.flatMap((line) => line.words);
  if (props.preset === "charStagger") {
    return Math.max(
      1,
      words.reduce((total, word) => total + word.text.length, 0),
    );
  }
  return Math.max(1, words.length);
};

const effectiveStagger = (props: KineticTitleProps) =>
  props.preset === "charStagger"
    ? props.staggerFrames * CHAR_STAGGER_RATIO
    : props.staggerFrames;

/** Frame à laquelle le dernier élément a fini d'entrer */
const enterEnd = (props: KineticTitleProps) =>
  (unitCount(props) - 1) * effectiveStagger(props) + props.animDurationFrames;

/**
 * Durée totale : entrée complète + maintien + sortie + marge.
 * Utilisée par calculateMetadata, donc la compo s'adapte au texte et aux
 * réglages sans qu'on ait à toucher Root.tsx.
 */
export const kineticTitleDuration = (props: KineticTitleProps): number => {
  const out = props.animateOut
    ? (unitCount(props) - 1) * OUT_STAGGER + OUT_DURATION
    : 0;
  return Math.ceil(enterEnd(props) + props.holdFrames + out + TAIL_FRAMES);
};

export const calculateKineticTitleMetadata: CalculateMetadataFunction<
  KineticTitleProps
> = ({ props }) => ({
  durationInFrames: kineticTitleDuration(props),
});

/* ════════════════════════════════════════════════════════════════════════════
   ANIMATION
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Bruit déterministe dans [0,1). Même entrée = même sortie, à chaque rendu :
 * indispensable, un Math.random() ferait scintiller le rendu entre les frames
 * et casserait la reprise d'un rendu distribué.
 */
const noise = (seed: number): number => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

type UnitAnim = {
  /** Entrée eased 0 → 1 */
  enter: number;
  /** Entrée ressort 0 → 1 avec léger dépassement */
  settle: number;
  /** Sortie 0 → 1 */
  exit: number;
  /** Frame de départ de l'élément */
  delay: number;
};

const unitAnim = (
  index: number,
  props: KineticTitleProps,
  frame: number,
  fps: number,
): UnitAnim => {
  const delay = index * effectiveStagger(props);

  const enter = interpolate(
    frame,
    [delay, delay + props.animDurationFrames],
    [0, 1],
    { ...CLAMP, easing: EASE_OUT },
  );

  const settle = spring({
    frame: frame - delay,
    fps,
    config: SPRING_CONFIG,
    durationInFrames: props.animDurationFrames,
  });

  const outStart = enterEnd(props) + props.holdFrames + index * OUT_STAGGER;
  const exit = props.animateOut
    ? interpolate(frame, [outStart, outStart + OUT_DURATION], [0, 1], {
        ...CLAMP,
        easing: EASE_IN,
      })
    : 0;

  return { enter, settle, exit, delay };
};

/** Sens du glissement de lineSlide : on entre depuis le bord vers lequel on est aligné */
const slideDirection = (align: KineticTitleProps["align"]) =>
  align === "right" ? 1 : -1;

/* ════════════════════════════════════════════════════════════════════════════
   RENDU
   ════════════════════════════════════════════════════════════════════════════ */

type WordProps = {
  word: ParsedWord;
  props: KineticTitleProps;
  frame: number;
  fps: number;
  color: string;
  gap: number;
};

/** wordsUp — le mot monte et se pose, avec le léger dépassement du ressort */
const WordsUpWord: React.FC<WordProps> = ({
  word,
  props,
  frame,
  fps,
  color,
  gap,
}) => {
  const { enter, settle, exit } = unitAnim(word.wordIndex, props, frame, fps);
  const y = WORDS_UP_RISE * (1 - settle) - WORDS_UP_EXIT * exit;

  return (
    <span
      style={{
        display: "inline-block",
        marginRight: gap,
        color,
        opacity: enter * (1 - exit),
        transform: `translateY(${y}px)`,
      }}
    >
      {word.text}
    </span>
  );
};

/** charStagger — lettre par lettre, fade + petit pop d'échelle */
const CharStaggerWord: React.FC<WordProps> = ({
  word,
  props,
  frame,
  fps,
  color,
  gap,
}) => (
  <span style={{ display: "inline-block", marginRight: gap, color }}>
    {word.text.split("").map((char, i) => {
      const { enter, settle, exit } = unitAnim(
        word.charStart + i,
        props,
        frame,
        fps,
      );
      const scale =
        (CHAR_SCALE_FROM + (1 - CHAR_SCALE_FROM) * settle) * (1 - 0.08 * exit);

      return (
        <span
          key={`${word.wordIndex}-${i}`}
          style={{
            display: "inline-block",
            opacity: enter * (1 - exit),
            transform: `scale(${scale})`,
          }}
        >
          {char}
        </span>
      );
    })}
  </span>
);

/** scaleBlur — punch-in : l'échelle se resserre pendant que le flou se lève */
const ScaleBlurWord: React.FC<WordProps> = ({
  word,
  props,
  frame,
  fps,
  color,
  gap,
}) => {
  const { enter, settle, exit } = unitAnim(word.wordIndex, props, frame, fps);
  const scale = 1 + (SCALE_BLUR_FROM - 1) * (1 - settle) + 0.06 * exit;
  const blur =
    SCALE_BLUR_PX * Math.max(0, 1 - enter * SCALE_BLUR_SHARPEN) + 8 * exit;

  return (
    <span
      style={{
        display: "inline-block",
        marginRight: gap,
        color,
        opacity: enter * (1 - exit),
        transform: `scale(${scale})`,
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
      }}
    >
      {word.text}
    </span>
  );
};

/**
 * glitch — apparition parasitée : deux copies décalées en rouge et cyan
 * (aberration chromatique) plus une découpe en bandes. Tout est tiré de
 * `noise(index, palier de frames)`, donc strictement reproductible.
 */
const GlitchWord: React.FC<WordProps> = ({
  word,
  props,
  frame,
  fps,
  color,
  gap,
}) => {
  const { enter, exit, delay } = unitAnim(word.wordIndex, props, frame, fps);

  const amount = interpolate(frame, [delay, delay + GLITCH_FRAMES], [1, 0], {
    ...CLAMP,
    easing: Easing.linear,
  });
  const step = Math.floor(frame / GLITCH_STEP);
  const seed = word.wordIndex * 13 + step;

  const shift = (noise(seed) * 2 - 1) * GLITCH_SHIFT_PX * amount;
  const top = noise(seed + 101) * GLITCH_CLIP * amount * 100;
  const bottom = noise(seed + 227) * GLITCH_CLIP * amount * 100;
  // léger scintillement pendant le parasitage, puis opacité pleine
  const flicker = 1 - amount * 0.4 * noise(seed + 349);

  const ghost: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    whiteSpace: "pre",
    opacity: amount * 0.9,
  };

  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        marginRight: gap,
        color,
        opacity: enter * flicker * (1 - exit),
        clipPath: amount > 0 ? `inset(${top}% 0 ${bottom}% 0)` : undefined,
        transform: `translateX(${shift * 0.35}px)`,
      }}
    >
      <span
        aria-hidden
        style={{
          ...ghost,
          color: GLITCH_RED,
          transform: `translateX(${-shift}px)`,
        }}
      >
        {word.text}
      </span>
      <span
        aria-hidden
        style={{
          ...ghost,
          color: GLITCH_CYAN,
          transform: `translateX(${shift}px)`,
        }}
      >
        {word.text}
      </span>
      <span style={{ position: "relative" }}>{word.text}</span>
    </span>
  );
};

/** Mot sans animation propre : utilisé par les presets qui animent la ligne */
const PlainWord: React.FC<Pick<WordProps, "word" | "color" | "gap">> = ({
  word,
  color,
  gap,
}) => (
  <span style={{ display: "inline-block", marginRight: gap, color }}>
    {word.text}
  </span>
);

export const KineticTitle: React.FC<KineticTitleProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lines = parseText(props.text);
  const gap = props.fontSizePx * WORD_GAP_EM;
  const direction = slideDirection(props.align);

  // La police demandée d'abord, puis celle chargée ici, puis la sans système
  const fontStack = `"${props.fontFamily}", "${LOADED_FONT}", system-ui, -apple-system, "Segoe UI", sans-serif`;

  const colorOf = (word: ParsedWord) =>
    props.accentWords.includes(word.wordIndex)
      ? props.accentColor
      : props.textColor;

  const renderWords = (line: ParsedLine) => {
    if (line.words.length === 0) {
      // ligne vide : on garde sa hauteur pour préserver l'interligne voulu
      return <span style={{ display: "inline-block" }}>&nbsp;</span>;
    }

    return line.words.map((word, i) => {
      const shared = {
        word,
        props,
        frame,
        fps,
        color: colorOf(word),
        gap: i === line.words.length - 1 ? 0 : gap,
      };

      switch (props.preset) {
        case "charStagger":
          return <CharStaggerWord key={word.wordIndex} {...shared} />;
        case "scaleBlur":
          return <ScaleBlurWord key={word.wordIndex} {...shared} />;
        case "glitch":
          return <GlitchWord key={word.wordIndex} {...shared} />;
        case "maskReveal":
        case "lineSlide":
          return (
            <PlainWord
              key={word.wordIndex}
              word={word}
              color={shared.color}
              gap={shared.gap}
            />
          );
        default:
          return <WordsUpWord key={word.wordIndex} {...shared} />;
      }
    });
  };

  const renderLine = (line: ParsedLine) => {
    const { enter, settle, exit } = unitAnim(line.lineIndex, props, frame, fps);

    if (props.preset === "maskReveal") {
      // Pas de ressort ici : un dépassement sortirait du masque par le haut.
      return (
        <div key={line.lineIndex} style={{ overflow: "hidden" }}>
          <div
            style={{
              transform: `translateY(${(1 - enter) * 100 - exit * 100}%)`,
            }}
          >
            {renderWords(line)}
          </div>
        </div>
      );
    }

    if (props.preset === "lineSlide") {
      const x =
        direction * LINE_SLIDE_IN * (1 - settle) -
        direction * LINE_SLIDE_OUT * exit;
      return (
        <div
          key={line.lineIndex}
          style={{
            opacity: enter * (1 - exit),
            transform: `translateX(${x}px)`,
          }}
        >
          {renderWords(line)}
        </div>
      );
    }

    return <div key={line.lineIndex}>{renderWords(line)}</div>;
  };

  return (
    <AbsoluteFill
      style={{
        // undefined et non 'transparent' : rien n'est peint, l'alpha est intact
        backgroundColor:
          props.background === "transparent" ? undefined : props.background,
        justifyContent: "center",
        alignItems:
          props.align === "left"
            ? "flex-start"
            : props.align === "right"
              ? "flex-end"
              : "center",
        padding: `0 ${SIDE_PADDING}`,
        fontFamily: fontStack,
        fontWeight: props.fontWeight,
        fontSize: props.fontSizePx,
        lineHeight: LINE_HEIGHT,
        color: props.textColor,
        textAlign: props.align,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div style={{ width: "100%" }}>{lines.map(renderLine)}</div>
    </AbsoluteFill>
  );
};
