#!/bin/bash
set -e

DOMAIN="devnet-api.ainetwork.ai"
EMAIL="${SSL_EMAIL:-dev@ainetwork.ai}"
STAGING="${SSL_STAGING:-0}" # Set to 1 for testing to avoid rate limits

DATA_PATH="./certbot"

echo "### Setting up SSL for $DOMAIN ..."

# Step 1: Create dummy certificate so nginx can start
echo "### Creating dummy certificate ..."
DUMMY_PATH="/etc/letsencrypt/live/$DOMAIN"
docker compose run --rm --entrypoint "\
  mkdir -p '$DUMMY_PATH' && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout '$DUMMY_PATH/privkey.pem' \
    -out '$DUMMY_PATH/fullchain.pem' \
    -subj '/CN=localhost'" certbot
echo

# Step 2: Start nginx with the dummy certificate
echo "### Starting nginx ..."
docker compose up -d nginx
echo

# Wait for nginx to be ready
echo "### Waiting for nginx to start ..."
sleep 5

# Step 3: Delete dummy certificate
echo "### Deleting dummy certificate ..."
docker compose run --rm --entrypoint "\
  rm -rf /etc/letsencrypt/live/$DOMAIN && \
  rm -rf /etc/letsencrypt/archive/$DOMAIN && \
  rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot
echo

# Step 4: Request the real certificate
echo "### Requesting Let's Encrypt certificate for $DOMAIN ..."

STAGING_ARG=""
if [ "$SSL_STAGING" = "1" ]; then
  STAGING_ARG="--staging"
fi

docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $STAGING_ARG \
    --email $EMAIL \
    --domain $DOMAIN \
    --rsa-key-size 4096 \
    --agree-tos \
    --no-eff-email \
    --force-renewal" certbot
echo

# Step 5: Reload nginx with the real certificate
echo "### Reloading nginx ..."
docker compose exec nginx nginx -s reload

echo "### SSL setup complete!"
echo "### You can now run 'docker compose up -d' to start all services."
