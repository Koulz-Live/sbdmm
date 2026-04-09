#!/bin/bash
set -e

echo "==> Installing all dependencies (including devDependencies)..."
npm ci --include=dev

echo "==> Compiling @sbdmm/shared..."
cd packages/shared
../../node_modules/.bin/tsc --project tsconfig.json
cd ../..

echo "==> Building web app..."
cd apps/web
../../node_modules/.bin/vite build
cd ../..

echo "==> Build complete."
