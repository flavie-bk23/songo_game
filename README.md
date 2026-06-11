# Songho — Jeu de Mancala 3D

## Structure du projet

```
songho/
├── index.html          ← Page principale
├── css/
│   └── style.css       ← Styles + calques
├── js/
│   ├── background.js   ← Fond réaliste (image ou fallback bois)
│   ├── game.js         ← Logique du jeu (2×7 + 2 stores, 5 pions)
│   ├── three_board.js  ← Rendu 3D Three.js (plateau + graines)
│   └── main.js         ← Contrôleur principal
└── assets/
    └── board_bg.jpg    ←  À REMPLACER par votre photo Midjourney
```

## Installation

Aucune dépendance à installer. Three.js est chargé depuis CDN.

```bash
# Lancez simplement avec un serveur local :
php -S localhost:8000
# ou
python3 -m http.server 8000
```

Ouvrez `http://localhost:8000`

## Remplacer le fond par une image Midjourney

1. Générez une image avec le prompt ci-dessous
2. Sauvegardez-la sous `assets/board_bg.jpg`
3. Rechargez la page — le fond s'affiche automatiquement

### Prompt Midjourney recommandé

```
overhead top-down view of a traditional african mancala songho wooden board game,
two rows of seven carved wooden bowls filled with dark black seeds,
two large store bowls at each end, worn dark hardwood with natural grain,
two dark-skinned hands reaching from top and bottom of frame,
warm natural sunlight, photorealistic, 8k, shallow depth of field,
--ar 3:2 --v 6 --style raw
```

### Prompt alternatif (plus fidèle à la photo)
```
bird eye view mancala game board cameroon africa, wooden plank with carved holes,
black seeds pebbles scattered in bowls, dark skin hands playing,
concrete floor background, natural daylight, documentary photo style
--ar 16:9 --v 6
```

## Intégration dans PHP

```php
<!-- Dans votre template PHP : -->
<?php include 'songho/index.html'; ?>
```

Ou via iframe :
```html
<iframe src="songho/index.html" width="100%" height="600px" frameborder="0"></iframe>
```

## Règles du jeu implémentées

- Plateau 2×7 cases + 2 grandes cases (stores)
- 5 graines par case au départ (70 graines total)
- Semis dans le sens des aiguilles : joueur 1 = rangée du bas (gauche→droite)
- Rejoue si la dernière graine tombe dans son propre store
- Capture si dernière graine dans case vide de son côté (prend la case en face)
- Fin de partie quand une rangée est entièrement vide

## Contrôles

- **Cliquer une case** → semer les graines
- **Indice** → surligne la meilleure case
- **Nouvelle partie** → réinitialise

## Personnalisation

Dans `js/game.js` : modifiez `SEEDS_START` pour changer le nombre de graines de départ.  
Dans `css/style.css` : modifiez les couleurs de l'interface.  
Dans `js/three_board.js` : ajustez `CELL_W`, `CELL_H` pour la taille des cases.
