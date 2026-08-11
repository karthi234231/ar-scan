#!/bin/bash
set -e

echo "Building frontend..."
cd frontend
npm ci
npm run build

echo "Deploying to Netlify..."
npx netlify deploy --prod --dir=dist