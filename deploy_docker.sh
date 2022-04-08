#!/bin/bash

if [[ "$#" -lt 1 ]]; then
    printf "Usage: bash deploy_docker.sh [dev|staging|sandbox|exp|spring|summer|mainnet]\n"
    printf "Example: bash deploy_docker.sh dev\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ deploy_docker.sh ]]]]]\n\n"

if [[ "$1" != 'dev' ]] && [[ "$1" != 'staging' ]] && [[ "$1" != 'sandbox' ]] && [[ "$1" != 'exp' ]] && [[ "$1" != 'spring' ]] && [[ "$1" != 'summer' ]] && [[ "$1" != 'mainnet' ]]; then
    printf "Invalid season argument: $1\n"
    exit
fi

SEASON="$1"

IMAGE_NAME=ainblockchain/ain-blockchain:$SEASON
PACKAGE_VERSION=$(jq -r '.version' < package.json)
IMAGE_NAME_WITH_VERSION=$IMAGE_NAME-$PACKAGE_VERSION

docker login
docker build -t $IMAGE_NAME --build-arg SEASON=$SEASON .
docker tag $IMAGE_NAME $IMAGE_NAME_WITH_VERSION
docker push $IMAGE_NAME
docker push $IMAGE_NAME_WITH_VERSION
docker image rm $IMAGE_NAME
docker image rm $IMAGE_NAME_WITH_VERSION
