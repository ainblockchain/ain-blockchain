#!/bin/bash

if [[ "$#" -lt 0 ]]; then
    printf "Usage: bash deploy_docker.sh\n"
    printf "Example: bash deploy_docker.sh\n"
    printf "\n"
    exit
fi
printf "\n[[[[[ deploy_docker.sh ]]]]]\n\n"

# Get confirmation.
printf "\n"
printf "Do you want to proceed? Enter [deploy]: "
read CONFIRM
printf "\n\n"
if [[ ! $CONFIRM = "deploy" ]]
then
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi

PACKAGE_VERSION=$(jq -r '.version' < package.json)
IMAGE_NAME=ainblockchain/ain-blockchain:$PACKAGE_VERSION
IMAGE_NAME_LATEST=ainblockchain/ain-blockchain:latest

docker login
docker buildx create --use --driver docker-container
docker buildx build --push --platform linux/amd64,linux/arm64 -t $IMAGE_NAME .
docker buildx build --push --platform linux/amd64,linux/arm64 -t $IMAGE_NAME_LATEST .
docker buildx rm
