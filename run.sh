#!/bin/bash

cd "${SYMFONY_PROJECT_NAME}"

composer require symfony/twig-bundle

cp -R /app/src /app/templates ./
rm -rf /app/src /app/templates

env

echo '---------Initializing database start---------'

php bin/console doctrine:database:create
php bin/console doctrine:schema:update --force
#php bin/console zf:fixtures:load

echo '---------Initializing database end---------'

php -S 0.0.0.0:$PORT -t "$WEB_DIR"
