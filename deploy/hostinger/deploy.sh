#!/bin/bash
# Hostinger shared-hosting deploy script for the Laravel backend.
# Runs ON the Hostinger server. SSH in, then: `cd ~/domains/inv.daengtisia.online/inv_apps && ./deploy/hostinger/deploy.sh`
#
# Assumes:
#   - Repo cloned at ~/domains/inv.daengtisia.online/inv_apps
#   - backend/.env exists with real DB creds
#   - public_html symlink points to backend/public
#   - Hostinger Git auto-deploy for this subdomain is DISABLED
#     (it overwrites the document root with a fresh repo clone)

set -euo pipefail

PHP=/opt/alt/php84/usr/bin/php
COMPOSER=/usr/local/bin/composer

REPO_DIR="$HOME/domains/inv.daengtisia.online/inv_apps"
BACKEND_DIR="$REPO_DIR/backend"
PUBLIC_DIR="$BACKEND_DIR/public"

cd "$REPO_DIR"

echo "==> git pull"
git pull --ff-only origin main

echo "==> composer install"
cd "$BACKEND_DIR"
"$PHP" "$COMPOSER" install --no-dev --optimize-autoloader --no-interaction

echo "==> migrate"
"$PHP" artisan migrate --force

echo "==> rebuild caches"
"$PHP" artisan config:clear
"$PHP" artisan route:clear
"$PHP" artisan view:clear
"$PHP" artisan config:cache
"$PHP" artisan route:cache

echo "==> ensure storage symlink"
if [ ! -L "$PUBLIC_DIR/storage" ]; then
  ln -sf ../storage/app/public "$PUBLIC_DIR/storage"
fi

echo "==> fix permissions"
chmod -R 775 storage bootstrap/cache

echo "==> done."
