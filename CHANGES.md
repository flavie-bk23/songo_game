# Optimisations Songo — Versions améliorées

## 📋 Résumé des modifications

### ✅ Mode Partagé (Même site / localhost)
- Utilise **BroadcastChannel** pour la communication entre onglets
- Synchronisation ultra-rapide via localStorage
- Pas de latence réseau, très réactif
- Parfait pour deux joueurs sur le même navigateur

### ✅ Mode Distant (Sites distants)
- Synchronisation via **Ajax** avec serveur Node.js
- Communication sécurisée et robuste
- Idéal pour deux joueurs distants

---

## 🆕 Nouvelle fonctionnalité — Lien d'invitation (v3)

### Problème résolu
Les deux joueurs pouvaient ne pas se connaître ou ne pas savoir comment échanger un code.

### Deux méthodes désormais disponibles pour inviter

**Méthode 1 — Code (existante, conservée)**  
Bouton 📋 « Copier le code » : copie le code SONGO-XXXXXX à envoyer par chat/SMS/email.

**Méthode 2 — Lien (nouvelle)**  
Bouton 🔗 « Copier le lien » : copie une URL complète du type :

    https://votre-site.com/?room=SONGO-XXXXXX

L'autre joueur clique simplement sur le lien. Le jeu s'ouvre et pré-remplit automatiquement le code dans le panneau "Rejoindre". Il n'a qu'à appuyer sur Rejoindre.

### Auto-détection URL
Quand l'URL contient ?room=CODE, le panneau s'ouvre automatiquement en mode "Rejoindre" avec le code pré-rempli.

---

## 🔧 Autres optimisations

### js/main.js
1. Polling amélioré — 800ms pour réduire la charge serveur
2. Error handling renforcé — messages d'erreur explicites
3. Meilleure synchronisation d'état — prévention des race conditions

### server.js
1. Nettoyage automatique — salles supprimées après 30 min
2. Prévention des surcharges — limite 1000 salles, HTTP 503
3. Stabilité améliorée — validation robuste

---

## 🌐 Hébergement gratuit recommandé

### Version serveur distant (Node.js + Ajax)

| Service | Gratuit | Remarques |
|---------|---------|-----------|
| Render.com | Oui | Le plus simple pour Node.js. Déploiement Git auto. Dors après 15 min d'inactivité. |
| Railway.app | 5$/mois offerts | Très facile, redémarre sans délai. |
| Glitch.com | Oui | Éditeur en ligne, déploiement instantané. Ralentit après inactivité. |
| Fly.io | Tier gratuit | Plus avancé, mais très stable. |

RECOMMANDATION : Render.com pour débuter. Déposez le dossier sur GitHub, connectez Render,
choisissez Node.js, commande start : node server.js

### Version même site (HTML/CSS/JS pur, sans serveur)

| Service | Gratuit | Remarques |
|---------|---------|-----------|
| GitHub Pages | Oui | Gratuit, rapide, fiable. |
| Netlify | Oui | Déploiement par drag & drop du dossier. |
| Vercel | Oui | Très rapide, supporte aussi Node.js. |

---

## 📝 Comment utiliser

### Mode Partagé (même site)
1. Ouvrez le jeu dans le même navigateur (2 onglets)
2. Le premier onglet crée la partie
3. Le deuxième onglet la rejoint automatiquement

### Mode Distant — via code (méthode existante)
1. Lancez : node server.js
2. Cliquez "Deux joueurs à distance"
3. Créez une salle → copiez le code → envoyez à l'autre joueur

### Mode Distant — via lien (méthode nouvelle)
1. Lancez : node server.js
2. Cliquez "Deux joueurs à distance"
3. Créez une salle → cliquez 🔗 Copier le lien
4. Envoyez le lien par WhatsApp, email, SMS…
5. L'autre joueur clique le lien → code pré-rempli → il clique Rejoindre

---

## ⚙️ Fichiers modifiés (v3)

- js/main.js — Lien d'invitation, auto-join URL, copy functions
- css/menu.css — Styles boutons partage (.room-share-row, .room-share-btn)
- index.html — Boutons 📋 et 🔗 dans le panneau salle
- CHANGES.md — Ce fichier

Aucun autre fichier n'a été modifié.
