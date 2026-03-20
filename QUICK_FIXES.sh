#!/usr/bin/env bash
set -euo pipefail

echo "Running safe repository hygiene steps..."
npm run lint:fix
npm test
npm run build

echo
echo "Manual follow-ups still recommended:"
echo "- Review and replace electron-reload alpha dependency if desired"
echo "- Add coverage reporting"
echo "- Add real-audio chord fixtures"

