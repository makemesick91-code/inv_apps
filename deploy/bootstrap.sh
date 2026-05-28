#!/bin/bash
# One-time VPS bootstrap. Run as the `deploy` user AFTER you have:
#   - created the user, added it to sudoers
#   - installed: nginx, php8.2-fpm + extensions, mariadb, node 20, composer, pm2, git
#   - created the MySQL database + user
#   - cloned the repo to /var/www/inv_apps
#   - copied backend/.env.production.example -> backend/.env and filled in real values
#   - copied frontend/.env.production.example -> frontend/.env.production
# Then: chmod +x deploy/bootstrap.sh && ./deploy/bootstrap.sh

set -euo pipefail

APP_DIR="/var/www/inv_apps"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

echo "==> Backend: composer install"
cd "$BACKEND_DIR"
composer install --no-dev --optimize-autoloader --no-interaction

echo "==> Backend: app key + migrate + seed"
php artisan key:generate --force
php artisan migrate --force
php artisan db:seed --force            # WARNING: creates demo accounts; remove or change passwords in real production
php artisan storage:link

echo "==> Backend: cache config + routes"
php artisan config:cache
php artisan route:cache

echo "==> Backend: storage permissions"
sudo chown -R deploy:www-data storage bootstrap/cache
sudo chmod -R 775 storage bootstrap/cache

echo "==> Frontend: npm ci + build"
cd "$FRONTEND_DIR"
npm ci
npm run build

echo "==> Frontend: start with PM2"
pm2 start npm --name "inv-web" -- start
pm2 save

echo "==> Reminder: set up Laravel scheduler cron:"
echo "    sudo crontab -u deploy -e"
echo "    * * * * * cd $BACKEND_DIR && php artisan schedule:run >> /dev/null 2>&1"
echo
echo "==> Reminder: enable PM2 on boot:"
echo "    pm2 startup systemd     # follow the printed command"
echo
echo "==> Bootstrap done."
