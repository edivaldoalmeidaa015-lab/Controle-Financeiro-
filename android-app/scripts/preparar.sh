#!/usr/bin/env bash
# Gera o projeto Android do Capacitor e aplica ícone, assinatura fixa e versão.
# Uso (no CI): bash scripts/preparar.sh <número da versão>
set -euo pipefail
cd "$(dirname "$0")/.."
VER="${1:-1}"
[ -d android ] || npx cap add android
npx cap sync android
RES=android/app/src/main/res
# ícone do painel em todas as densidades (sem o ícone adaptativo padrão do Capacitor)
rm -rf "$RES"/mipmap-anydpi-v26
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  for n in ic_launcher ic_launcher_round ic_launcher_foreground; do cp ../turbinas/icone-512.png "$RES/mipmap-$d/$n.png"; done
done
# tela de abertura com o ícone do painel (no lugar do logo do Capacitor)
for f in "$RES"/drawable*/splash.png; do cp splash.png "$f"; done
G=android/app/build.gradle
# mesma assinatura em todas as versões: o APK novo instala por cima do antigo
grep -q "debug.keystore" "$G" || sed -i "0,/^android {/s//android {\n    signingConfigs {\n        debug {\n            storeFile file('..\/..\/debug.keystore')\n            storePassword 'android'\n            keyAlias 'androiddebugkey'\n            keyPassword 'android'\n        }\n    }/" "$G"
sed -i -E "s/versionCode [0-9]+/versionCode $VER/; s/versionName \"[^\"]*\"/versionName \"1.$VER\"/" "$G"
grep -n "versionCode\|versionName\|storeFile" "$G"
