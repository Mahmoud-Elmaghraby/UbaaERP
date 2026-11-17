#!/bin/sh
# Brings the database up to date on every start, then runs the API.
set -e
cd /app/apps/api
npx prisma migrate deploy
node dist/database/public/seed-plans.command.js
node dist/database/tenant/migration-runner.service.js
exec node dist/main.js
