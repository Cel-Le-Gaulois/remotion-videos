#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analyse_audio.py — Detection des pics d'intensite sonore (onsets / attaques)

Analyse un fichier audio (wav ou mp3) et affiche, pour chaque attaque detectee,
son timecode en secondes et la frame correspondante a 30 fps. Pratique pour
caler des animations Remotion sur la bande son.

------------------------------------------------------------------------------
INSTALLATION DES DEPENDANCES (une seule fois) :
    pip install librosa numpy

    (librosa lit nativement le wav ; pour le mp3 il s'appuie sur soundfile /
     audioread. Si la lecture d'un mp3 echoue, installer ffmpeg :
       - Windows : winget install Gyan.FFmpeg   (ou choco install ffmpeg)
       - macOS   : brew install ffmpeg
       - Linux   : sudo apt install ffmpeg)

LANCEMENT DU SCRIPT (depuis la racine du projet) :
    python tools/analyse_audio.py "public/Sounds/ValekStudio_cinematic_06.wav"
------------------------------------------------------------------------------
"""

import argparse
import os
import sys

import numpy as np
import librosa

# =============================================================================
# REGLAGES
# =============================================================================

# SENSIBILITE : seuil de detection des pics (parametre "delta" du peak-picking).
#   - Valeur PLUS PETITE  -> plus sensible  -> DETECTE PLUS de pics (y compris faibles)
#   - Valeur PLUS GRANDE  -> moins sensible -> DETECTE MOINS de pics (gros impacts only)
# Plage utile typique : 0.02 (tres sensible) a 0.30 (seulement les grosses attaques).
# Ajuster par paliers de 0.02 jusqu'a obtenir le nombre de pics voulu.
SENSIBILITE = 0.07

# Cadence video utilisee pour convertir les secondes en numero de frame.
FPS = 30


# =============================================================================
# ANALYSE
# =============================================================================

def detecter_pics(chemin_audio, sensibilite=SENSIBILITE, fps=FPS):
    """Charge l'audio, detecte les onsets et retourne une liste de (temps_s, frame)."""

    # Chargement (sr=None garde la frequence d'echantillonnage d'origine ;
    # mono=True mixe les canaux pour une analyse plus stable).
    y, sr = librosa.load(chemin_audio, sr=None, mono=True)
    duree = librosa.get_duration(y=y, sr=sr)

    # Enveloppe d'attaque (onset strength) : plus elle monte vite, plus c'est une attaque.
    enveloppe = librosa.onset.onset_strength(y=y, sr=sr)

    # Detection des pics. `delta` = SENSIBILITE : seuil au-dessus de la moyenne locale.
    frames_onset = librosa.onset.onset_detect(
        onset_envelope=enveloppe,
        sr=sr,
        units="frames",
        backtrack=False,
        delta=sensibilite,
    )

    # Conversion frames d'analyse -> temps en secondes.
    temps_s = librosa.frames_to_time(frames_onset, sr=sr)

    pics = [(float(t), int(round(t * fps))) for t in temps_s]
    return pics, duree


def main():
    parser = argparse.ArgumentParser(
        description="Detecte les pics d'intensite sonore (attaques) d'un fichier audio."
    )
    parser.add_argument(
        "fichier",
        help="Chemin du fichier audio (.wav ou .mp3), p.ex. public/Sounds/mon_son.wav",
    )
    parser.add_argument(
        "-s", "--sensibilite",
        type=float,
        default=SENSIBILITE,
        help=f"Seuil de detection (defaut: {SENSIBILITE}). "
             "Plus petit = plus de pics, plus grand = moins de pics.",
    )
    parser.add_argument(
        "--fps",
        type=int,
        default=FPS,
        help=f"Cadence video pour le calcul des frames (defaut: {FPS}).",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.fichier):
        print(f"[ERREUR] Fichier introuvable : {args.fichier}", file=sys.stderr)
        sys.exit(1)

    ext = os.path.splitext(args.fichier)[1].lower()
    if ext not in (".wav", ".mp3"):
        print(f"[ATTENTION] Extension '{ext}' inhabituelle (attendu .wav ou .mp3). "
              "Tentative de lecture quand meme...", file=sys.stderr)

    print(f"Analyse de : {args.fichier}")
    print(f"Sensibilite : {args.sensibilite}   |   FPS : {args.fps}")
    print("-" * 52)

    try:
        pics, duree = detecter_pics(args.fichier, args.sensibilite, args.fps)
    except Exception as exc:  # noqa: BLE001
        print(f"[ERREUR] Echec de l'analyse audio : {exc}", file=sys.stderr)
        print("Si c'est un .mp3, verifier que ffmpeg est installe (voir en-tete du script).",
              file=sys.stderr)
        sys.exit(1)

    if not pics:
        print("Aucun pic detecte. Essayez une sensibilite plus PETITE "
              "(ex: -s 0.03).")
        return

    print(f"{'#':>3}  {'Temps (s)':>10}  {'Frame @' + str(args.fps) + 'fps':>12}")
    print("-" * 52)
    for i, (t, frame) in enumerate(pics, start=1):
        print(f"{i:>3}  {t:>10.3f}  {frame:>12}")

    print("-" * 52)
    print(f"{len(pics)} pic(s) detecte(s) sur {duree:.2f} s "
          f"(soit {int(round(duree * args.fps))} frames a {args.fps} fps).")


if __name__ == "__main__":
    main()
