#!/bin/bash
set -e

echo "==> Installing all dependencies (including devDependencies)..."
npm ci --include=dev

echo "==> Building web app..."
cd apps/web
../../node_modules/.bin/vite build
cd ../..

echo "==> Build complete."
