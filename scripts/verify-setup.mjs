#!/usr/bin/env node

/**
 * Cadence Player Setup Verification Script
 * Validates local system compatibility, directory structure, and dependency alignment.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const REQUIRED_NODE_MAJOR = 18;
const REQUIRED_DIRECTORIES = [
  'src',
  'src/js',
  'src/css',
  'test',
  'assets'
];

let failed = false;

function logSuccess(message) {
  console.log(`\x1b[32m✔ ${message}\x1b[0m`);
}

function logError(message) {
  console.log(`\x1b[31m✘ ${message}\x1b[0m`);
  failed = true;
}


console.log('====================================================');
console.log('     Cadence Player Setup Diagnostics Tool');
console.log('====================================================\n');

// 1. Verify Node.js Version
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
if (majorVersion >= REQUIRED_NODE_MAJOR) {
  logSuccess(`Node.js version is compatible: v${nodeVersion} (Requires >= v${REQUIRED_NODE_MAJOR})`);
} else {
  logError(`Node.js version is incompatible: v${nodeVersion} (Requires >= v${REQUIRED_NODE_MAJOR})`);
}

// 2. Verify Directory Structure
let dirPass = true;
for (const dir of REQUIRED_DIRECTORIES) {
  const fullPath = path.join(rootDir, dir);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    continue;
  } else {
    logError(`Missing required directory: ${dir}`);
    dirPass = false;
  }
}
if (dirPass) {
  logSuccess('All required project directories are present.');
}

// 3. Verify package.json and package-lock.json alignment
const pkgPath = path.join(rootDir, 'package.json');
const lockPath = path.join(rootDir, 'package-lock.json');

if (!fs.existsSync(pkgPath)) {
  logError('package.json not found in project root!');
} else {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    logSuccess(`package.json is readable. Project: ${pkg.name} v${pkg.version}`);
    
    // Check key package.json properties
    if (!pkg.main) {
      logError('package.json is missing "main" entrypoint configuration.');
    } else {
      const entryPath = path.join(rootDir, pkg.main);
      if (fs.existsSync(entryPath)) {
        logSuccess(`Main entrypoint is valid: ${pkg.main}`);
      } else {
        logError(`Main entrypoint file not found: ${pkg.main}`);
      }
    }

    // Verify dependencies are installed
    const expectedDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {})
    };
    
    let depsMissing = false;
    for (const dep of Object.keys(expectedDeps)) {
      const depPath = path.join(rootDir, 'node_modules', dep);
      if (!fs.existsSync(depPath)) {
        logError(`Dependency is not installed: ${dep}`);
        depsMissing = true;
      }
    }
    
    if (!depsMissing) {
      logSuccess('All defined dependencies are installed in node_modules.');
    }
  } catch (err) {
    logError(`Failed to parse package.json: ${err.message}`);
  }
}

if (!fs.existsSync(lockPath)) {
  logError('package-lock.json not found! Run "npm install" to generate lockfile.');
} else {
  logSuccess('package-lock.json is present.');
}

// 4. Output Diagnostic Summary
console.log('\n----------------------------------------------------');
if (failed) {
  console.log('\x1b[31mDiagnostic Summary: FAILED. Please address the errors above.\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32mDiagnostic Summary: PASSED. All environment and codebase checks look pristine!\x1b[0m');
  process.exit(0);
}
