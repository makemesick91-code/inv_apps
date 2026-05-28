#!/bin/bash
# Production deploy script — run on the VPS as the `deploy` user.
# Usage: ./deploy.sh

set -euo pipefail

APP_DIR="/var/www/inv_apps"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
PM2_PROCESS="inv-web"

echo "==> Pulling latest from origin/main"
cd "$APP_DIR"
git pull origin main

echo "==> Backend: composer install"
cd "$BACKEND_DIR"
composer install --no-dev --optimize-autoloader --no-interaction

echo "==> Backend: migrate"
php artisan migrate --force

echo "==> Backend: clear + recache config/routes"
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan config:cache
php artisan route:cache

echo "==> Backend: fix storage permissions"
sudo chown -R deploy:www-data storage bootstrap/cache
sudo chmod -R 775 storage bootstrap/cache

echo "==> Frontend: npm ci + build"
cd "$FRONTEND_DIR"
npm ci
npm run build

echo "==> Frontend: restart PM2"
pm2 restart "$PM2_PROCESS" --update-env

echo "==> Done."
