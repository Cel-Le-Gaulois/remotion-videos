import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/* ════════════════════════════════════════════════════════════════════════════
   RÉGLAGES — tout se pilote depuis ce bloc
   ════════════════════════════════════════════════════════════════════════════ */

/** Fichier de l'avatar dans public/ */
const AVATAR = "avatar.png";

/** Visible uniquement si le PNG a de la transparence */
const BG = "#FFFFFF";

/**
 * Couleurs relevées au pixel sur avatar.png (peau autour de l'œil).
 * SKIN sert AUSSI à la main : gardé sur la valeur mesurée plutôt que #ECB783,
 * car la paupière doit matcher le PNG au pixel près (l'écart est de 1 à 2
 * unités sur R et G, invisible à l'œil).
 */
const SKIN = "#EDB983";
const LINE = "#1a1512";

/**
 * Œil qui cligne (viewer-gauche = sa droite).
 * Mesuré au pixel sur le PNG : le blanc va de x 261..452 et y 436..625,
 * soit un quasi-cercle de rayon 95 centré (356, 530).
 */
const WINK_EYE = { cx: 356, cy: 530, rx: 95, ry: 95 };
/** Autre œil — dispo si tu veux passer le clin d'œil de l'autre côté */
// const OTHER_EYE = { cx: 558, cy: 530, rx: 96, ry: 95 };

/**
 * Paupière = ellipse de l'œil + marge, pour recouvrir son contour noir (~5 px).
 * L'ellipse n'est JAMAIS déformée : c'est un masque rectangulaire qui la
 * dévoile de haut en bas, comme un store.
 * Asymétrique : les deux yeux se touchent, le noir commun occupe x 453..461.
 * On déborde donc à gauche (dx négatif) et on s'arrête net à droite, sinon la
 * paupière mange le contour de l'œil resté ouvert.
 * padY généreux = garantie que le bas du contour noir de l'œil est noyé.
 */
const LID = { dx: -4, dy: 0, padX: 6, padY: 12 };

/**
 * Pli de la paupière : trait noir posé exactement sur la ligne de coupe du
 * masque, donc il descend avec elle. Ce n'est pas un trait flottant.
 */
const CREASE = {
  stroke: 5.5, // épaisseur du pli (couleur LINE)
  bulge: 0.2, // creux au centre, en fraction de la demi-largeur
  overhang: 1, // dépassement latéral (px) pour couvrir les coins de la coupe
  restWidth: 0.7, // demi-largeur du trait à la fermeture (× rx de l'œil)
  restY: 0.96, // hauteur finale de la coupe (1 = bas de la paupière)
  fadeIn: 0.12, // part du progress sur laquelle le trait apparaît
};

/** Timings du clin d'œil (frames) */
const WINK = {
  closeStart: 15,
  closeEnd: 21,
  holdEnd: 24,
  openEnd: 31,
};

/** Pouce en l'air : position, taille et timings */
const THUMB = {
  x: 672, // coin haut-gauche du dessin, en coords compo (1024x1024)
  /**
   * Boîte locale 240x600 (l'avant-bras descend jusqu'à 600).
   * Avec y=541 et scale 1.45, geste discret en bas-droite : bout du pouce à
   * y≈638 (niveau barbe/mâchoire), bas du poing à y≈991 soit 33 px au-dessus
   * du bord, et le bord plat du bas atterrit à y≈1386-1408 → toujours coupé.
   */
  y: 541,
  scale: 1.45,
  rotate: -8, // inclinaison au repos (deg), penche vers le visage
  rotateFrom: -26, // inclinaison au moment où il surgit
  /**
   * Course du pop, calée sur la nouvelle position basse : juste ce qu'il faut
   * pour partir de sous le cadre. Le point le plus haut du dessin (incliné à
   * rotateFrom) est alors à y≈1078 ; à 360 il repasserait à y≈1018, visible.
   */
  riseFrom: 420,
  enterFrame: 33,
  exitStart: 72,
  exitEnd: 86,
  pivot: [120, 300], // centre de rotation, en coords locales (le poignet)
};

/**
 * Respiration ambiante — période = durée totale, donc frame 0 = frame de fin,
 * raccord net. Uniquement des transforms UNIFORMES (scale global, translate,
 * rotate) : pas de scaleX/scaleY séparés ni de skew, qui déformeraient la
 * bouche et la barbe.
 * `zoom` est un sur-cadrage fixe obligatoire : l'avatar embarque son décor, et
 * sans lui la rotation découvrirait les bords du PNG. Le minimum calculé pour
 * ces amplitudes est 1.007 ; 1.04 laisse de la marge.
 */
const BREATH = {
  scale: 0.008, // amplitude du zoom de respiration
  bobY: 3, // amplitude du bob vertical (px)
  bobPhase: 0.6, // déphasage du bob (rad) → moins mécanique que du synchrone
  deg: 0.4, // amplitude du balancement (deg)
  zoom: 1.04, // sur-cadrage fixe
  origin: "50% 50%",
};

/**
 * Petit push-in pendant le clin d'œil, uniforme lui aussi.
 * Le retour passe par un ressort sous-amorti : la valeur dépasse le neutre
 * (≈ −0.2) avant de se stabiliser, ce qui donne le rebond élastique.
 */
const WINK_ZOOM = {
  amount: 0.02, // zoom max à œil fermé
  reboundFrames: 14, // durée du retour, à partir de holdEnd
  rebound: { damping: 9, mass: 0.7, stiffness: 150 },
};

/* ══════════════════════════════════════════════════════════════════════════ */

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const LID_CLIP_ID = "wink-lid-clip";

/** Main : avant-bras, pouce, poing, doigts. Le poing passe DEVANT le pouce. */
const ThumbsUp: React.FC = () => (
  <svg viewBox="0 0 240 600" width={240} height={600}>
    <path
      d="M98 300 C92 370 84 460 80 600 L192 600 C190 460 184 372 178 300 Z"
      fill={SKIN}
      stroke={LINE}
      strokeWidth={9}
      strokeLinejoin="round"
    />
    <path
      d="M120 208 C112 190 96 178 96 158 C96 137 103 118 107 104 C111 86 121 74 138 73 C156 72 167 88 167 110 C167 133 161 160 157 180 C154 192 149 201 143 208 Z"
      fill={SKIN}
      stroke={LINE}
      strokeWidth={9}
      strokeLinejoin="round"
    />
    <rect
      x="70"
      y="168"
      width="132"
      height="140"
      rx="44"
      fill={SKIN}
      stroke={LINE}
      strokeWidth={9}
    />
    <g stroke={LINE} strokeWidth={7} strokeLinecap="round" fill="none">
      <path d="M80 210 C96 216 122 220 152 210" />
      <path d="M80 248 C96 254 124 258 156 248" />
      <path d="M81 284 C96 289 122 292 152 284" />
    </g>
  </svg>
);

export const WinkThumbsUp: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  /* ── Respiration (une période pile sur la durée → raccord invisible) ───── */
  const phase = (2 * Math.PI * frame) / durationInFrames;
  const breathScale = 1 + BREATH.scale * Math.sin(phase);
  const breathY = BREATH.bobY * Math.sin(phase + BREATH.bobPhase);
  const breathRot = BREATH.deg * Math.sin(phase);

  /* ── Clin d'œil : 0 = œil ouvert, 1 = paupière entièrement descendue ───── */
  const lid = interpolate(
    frame,
    [WINK.closeStart, WINK.closeEnd, WINK.holdEnd, WINK.openEnd],
    [0, 1, 1, 0],
    { ...clamp, easing: Easing.inOut(Easing.quad) },
  );

  const lidCx = WINK_EYE.cx + LID.dx;
  const lidCy = WINK_EYE.cy + LID.dy;
  const lidRx = WINK_EYE.rx + LID.padX;
  const lidRy = WINK_EYE.ry + LID.padY;
  const lidTop = lidCy - lidRy;

  /* ── Ligne de coupe : descend du haut de la paupière jusque sous l'œil ──── */
  const cutY = interpolate(lid, [0, 1], [lidTop, lidCy + lidRy * CREASE.restY]);

  // Largeur de l'ellipse à cette hauteur = largeur exacte du bord à masquer.
  // En fin de course l'ellipse se referme en pointe : un plancher qui monte en
  // p² prend le relais pour que le pli reste une courbe douce, jamais un point.
  const cutT = (cutY - lidCy) / lidRy;
  const chord = lidRx * Math.sqrt(Math.max(0, 1 - cutT * cutT));
  const creaseHalf = Math.max(
    chord + CREASE.overhang,
    WINK_EYE.rx * CREASE.restWidth * lid * lid,
  );
  const sag = creaseHalf * CREASE.bulge;
  const clipHalf = Math.max(lidRx, creaseHalf) + 2;

  // Même parabole des deux côtés : le pli EST le bord inférieur du masque.
  const creasePath = `M ${lidCx - creaseHalf} ${cutY} Q ${lidCx} ${
    cutY + 2 * sag
  } ${lidCx + creaseHalf} ${cutY}`;

  const clipPath = [
    `M ${lidCx - clipHalf} ${lidTop - 1}`,
    `H ${lidCx + clipHalf}`,
    `V ${cutY}`,
    `H ${lidCx + creaseHalf}`,
    `Q ${lidCx} ${cutY + 2 * sag} ${lidCx - creaseHalf} ${cutY}`,
    `H ${lidCx - clipHalf}`,
    "Z",
  ].join(" ");

  const creaseOpacity = Math.min(1, lid / CREASE.fadeIn);

  /* ── Push-in du clin d'œil : 0 = neutre, 1 = œil au plus fermé ─────────── */
  // Fermeture + maintien : exactement la courbe du wink.
  const exprIn = interpolate(
    frame,
    [WINK.closeStart, WINK.closeEnd, WINK.holdEnd],
    [0, 1, 1],
    { ...clamp, easing: Easing.inOut(Easing.quad) },
  );
  // Retour : ressort sous-amorti parti de la valeur tenue → dépasse le neutre
  const exprBack = spring({
    frame: frame - WINK.holdEnd,
    fps,
    config: WINK_ZOOM.rebound,
    durationInFrames: WINK_ZOOM.reboundFrames,
  });
  const expr = frame < WINK.holdEnd ? exprIn : 1 - exprBack;

  // Un seul scale, uniforme : respiration × clin d'œil × sur-cadrage fixe
  const faceScale = BREATH.zoom * breathScale * (1 + WINK_ZOOM.amount * expr);

  /* ── Pouce : spring à l'entrée, ease à la sortie → revient au neutre ───── */
  const enter = spring({
    frame: frame - THUMB.enterFrame,
    fps,
    // Quasi critique (l'amortissement critique est à 21.9) : le bras monte et
    // s'arrête, dépassement 0.09 % soit 0.4 px sur les 420 de course.
    config: { damping: 20, mass: 1, stiffness: 120 },
  });

  const exit = interpolate(frame, [THUMB.exitStart, THUMB.exitEnd], [0, 1], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });

  const hidden = 1 - enter + exit;
  const thumbY = hidden * THUMB.riseFrom;
  const thumbRot = interpolate(
    enter - exit,
    [0, 1],
    [THUMB.rotateFrom, THUMB.rotate],
  );
  // petit bob pendant le maintien, même période que la respiration → loop-safe
  const thumbBob = Math.sin(phase * 2) * 4 * Math.max(0, 1 - hidden);

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {/* Visage : image + paupière dans le MÊME conteneur, donc la paupière
          respire et zoome avec le visage au lieu de se décaler */}
      <AbsoluteFill
        style={{
          transform: `translateY(${breathY}px) rotate(${breathRot}deg) scale(${faceScale})`,
          transformOrigin: BREATH.origin,
        }}
      >
        <Img
          src={staticFile(AVATAR)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />

        <AbsoluteFill>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height="100%"
            style={{ overflow: "visible" }}
          >
            {lid > 0.001 ? (
              <>
                <defs>
                  <clipPath id={LID_CLIP_ID}>
                    <path d={clipPath} />
                  </clipPath>
                </defs>
                {/* store : l'ellipse peau reste intacte, seule la découpe bouge */}
                <g clipPath={`url(#${LID_CLIP_ID})`}>
                  <ellipse
                    cx={lidCx}
                    cy={lidCy}
                    rx={lidRx}
                    ry={lidRy}
                    fill={SKIN}
                  />
                </g>
                {/* pli : posé pile sur le bord inférieur de la découpe */}
                <path
                  d={creasePath}
                  fill="none"
                  stroke={LINE}
                  strokeWidth={CREASE.stroke}
                  strokeLinecap="round"
                  opacity={creaseOpacity}
                />
              </>
            ) : null}
          </svg>
        </AbsoluteFill>
      </AbsoluteFill>

      {/* Pouce : calque indépendant, surgit du bas */}
      <AbsoluteFill>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
          <g
            transform={`translate(${THUMB.x} ${THUMB.y + thumbY + thumbBob}) scale(${THUMB.scale}) rotate(${thumbRot} ${THUMB.pivot[0]} ${THUMB.pivot[1]})`}
          >
            <ThumbsUp />
          </g>
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
