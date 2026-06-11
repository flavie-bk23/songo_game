#!/bin/bash

# Script de lancement du jeu Songo sur Linux/Mac
# Lance un serveur HTTP local et ouvre le jeu dans le navigateur

PORT=8000

# Se positionner dans le répertoire du script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR" || { echo "❌ Impossible d'accéder au répertoire du jeu"; exit 1; }

echo "🎮 Démarrage du jeu Songo..."
echo "📂 Répertoire : $SCRIPT_DIR"
echo "📍 Accédez au jeu à : http://localhost:$PORT"
echo ""
echo "📡 Pour jouer depuis une autre machine du réseau :"
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$IP" ]; then
  IP=$(ifconfig 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | head -1 | awk '{print $2}')
fi
if [ -n "$IP" ]; then
  echo "   http://$IP:$PORT"
fi
echo ""
echo "Appuyez sur Ctrl+C pour arrêter le serveur"
echo ""

# Essayer avec Python 3 d'abord, puis Python 2
if command -v python3 &> /dev/null; then
  python3 -m http.server $PORT --bind 0.0.0.0
elif command -v python &> /dev/null; then
  python -m SimpleHTTPServer $PORT
else
  echo "❌ Python n'est pas installé. Installez-le avec :"
  echo "   sudo apt install python3"
  exit 1
fi
