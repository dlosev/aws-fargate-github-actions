#!/bin/bash

composer require symfony/twig-bundle

cd "${SYMFONY_PROJECT_NAME}"

php bin/console doctrine:database:create
php bin/console doctrine:schema:update --force
#php bin/console zf:fixtures:load

php -S 0.0.0.0:$PORT -t "$WEB_DIR"
