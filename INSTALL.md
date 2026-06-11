# 🎮 Songo — Jeu de Mancala

Jeu de plateau Songo (Mancala) en 3D avec IA, jouable en multijoueur ou contre la machine.

## 📋 Prérequis

- **Python 3.x** (fourni sur la plupart des systèmes Linux/Mac)
  - Ou Python 2.7+ (pour Windows ou anciennes versions)
- Un **navigateur web moderne** (Chrome, Firefox, Safari, Edge, etc.)

## 🚀 Lancer le jeu

### Sur Linux/Mac

Double-cliquez sur `run-game.sh` ou exécutez dans un terminal :

```bash
bash run-game.sh
```

### Sur Windows

Double-cliquez sur `run-game.bat`

Ou dans un terminal (Cmd ou PowerShell) :

```cmd
run-game.bat
```

### Accès au jeu

Le script affiche l'adresse locale, par exemple :

- **Depuis cette machine** : http://localhost:8000
- **Depuis une autre machine du réseau** : http://192.168.x.x:8000 (l'IP s'affiche à l'écran)

## 🎯 Règles du jeu

### Mode 2 joueurs

- Joueur 1 : rangée du bas (cases 1-7)
- Joueur 2 : rangée du haut (cases 1-7)
- Semez des graines dans vos cases et collectez celles de l'adversaire

### Mode Machine

Jouez contre une IA stratégique.

### Objectif

- Première personne à atteindre 40 graines gagne
- Ou celui avec le plus de graines à la fin

## 📁 Fichiers du jeu

```
songo_dist/
├── index.html          # Page principale
├── run-game.sh         # Lanceur Linux/Mac
├── run-game.bat        # Lanceur Windows
├── README.md           # Ce fichier
├── css/
│   └── style.css       # Styles et interface
├── js/
│   ├── background.js   # Fond animé
│   ├── game.js         # Moteur de jeu
│   ├── main.js         # Contrôleur
│   └── three_board.js  # Rendu 3D
└── assets/
    └── LIRE_MOI.txt
```

## 🌐 Partager le jeu

Pour jouer avec d'autres sur le réseau local :

1. **Lancez le serveur** sur une machine (l'hôte)
2. **Notez l'adresse IP** affichée (ex: 192.168.1.100)
3. **Sur chaque autre machine**, allez à `http://IP:8000` dans le navigateur
4. **Jouez ensemble** — un joueur par machine, ou deux joueurs sur la même

## 🛠 Dépannage

### Le jeu ne démarre pas

- Vérifiez que Python est installé : `python3 --version`
- Assurez-vous qu'aucune autre application n'utilise le port 8000
- Essayez de modifier le port dans le script

### Impossible de se connecter depuis une autre machine

- Vérifiez que les deux machines sont sur le même réseau
- Assurez-vous que le firewall n'a pas bloqué le port 8000
- Utilisez l'adresse IP affichée au lancement, pas "localhost"

## 📝 Notes techniques

- Jeu 100% client-side (tout le code s'exécute dans le navigateur)
- Rendu 3D avec Three.js
- Aucun serveur backend nécessaire (juste HTTP pour les fichiers)
- Fonctionne offline une fois chargé

## 👨‍💻 Auteur

Jeu Songo — Version 2026

---

**Amusez-vous bien ! 🎲**
