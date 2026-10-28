#!/usr/bin/env bash
# Runs every tests/*.test.mjs; exits non-zero if any fails.
cd "$(dirname "$0")/.." || exit 1
status=0
for t in tests/*.test.mjs; do
  echo "== $t"
  node --dns-result-order=ipv4first "$t" || status=1
done
exit $status
