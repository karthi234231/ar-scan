#!/bin/bash
set -e

echo "Building backend..."
cd ../admin-backend
npm ci

echo "Starting backend..."
node src/index.js