#!/bin/bash

# Determine the type of build based on the first script argument
BUILD_TYPE=${1:-production}

if [ "$BUILD_TYPE" == "canary" ]; then
    TAG="canary"
else
    VERSION=$(node -p "require('./package.json').version")
    TAG="$VERSION"
fi

BUILDER=$(docker buildx create --use)

DOKPLOY_IMAGE_REPO="${DOKPLOY_IMAGE_REPO:-ghcr.io/rain-kl/dokploy}"

docker buildx build --platform linux/amd64,linux/arm64 --pull --rm -t "${DOKPLOY_IMAGE_REPO}:${TAG}" -f 'Dockerfile' .

docker buildx rm $BUILDER
