/**
 * Runs the onboarding migrations.
 * Usage: pnpm exec ts-node -r tsconfig-paths/register scripts/run-migration.ts
 * Or from backend/: pnpm run db:migrate
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const migrationsDir = path.join(__dirname, '../db/migrations');
const migrations = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  : [];

for (const file of migrations) {
  const migrationPath = path.join(migrationsDir, file);
  console.log(`Running ${file}...`);
  execSync(`psql "${url}" -f "${migrationPath}"`, { stdio: 'inherit' });
}
console.log('Migrations completed.');
