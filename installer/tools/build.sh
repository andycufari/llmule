#!/usr/bin/env bash
# Test builds: one binary per OS with `deno compile`, from a Mac. Output in dist/ (gitignored); older versions are kept.
# Then regenerate the one-line installers with the new sha256: node tools/gen-install.mjs
#   tools/build.sh
# Stamps the build date into lib/version.mjs for the compile and puts 'dev' back after (even on error).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
VERSION=$(sed -n "s/^export const VERSION = '\(.*\)';/\1/p" lib/version.mjs)
BUILT=$(date -u +%Y-%m-%d)
cp lib/version.mjs lib/version.mjs.bak
trap 'mv "$ROOT/lib/version.mjs.bak" "$ROOT/lib/version.mjs"' EXIT
sed -i '' "s/^export const BUILT = 'dev';/export const BUILT = '$BUILT';/" lib/version.mjs
grep -q "BUILT = '$BUILT'" lib/version.mjs

node --test --test-timeout=120000 llmule.test.mjs >/dev/null
node ../provider/mule-provider.test.mjs >/dev/null
# the site functions, on the fake platform (needs the site code: ../cm64/llmule.xyz, or LLMULE_SITE_DIR = a checkout of llmule-server)
if [ -d "${LLMULE_SITE_DIR:-../cm64/llmule.xyz}/function" ]; then node tools/site.test.mjs >/dev/null
else echo "skipping tools/site.test.mjs: no site code (set LLMULE_SITE_DIR to a checkout of andycufari/llmule-server)"; fi

# Older versions stay in dist/ (they're still on the server); only this version's files are rebuilt
# (exact names: a glob like llmule-0.2.3-* would also delete the 0.2.3-test files)
mkdir -p dist && rm -f dist/llmule-"$VERSION"-{linux-x64,linux-arm64,windows-x64.exe,mac-arm64,mac-x64}
for t in x86_64-unknown-linux-gnu:linux-x64 aarch64-unknown-linux-gnu:linux-arm64 x86_64-pc-windows-msvc:windows-x64 \
         aarch64-apple-darwin:mac-arm64 x86_64-apple-darwin:mac-x64; do
  out="dist/llmule-$VERSION-${t#*:}"
  deno compile -A --no-config --quiet --target "${t%%:*}" -o "$out" llmule.mjs
done
cd dist
shasum -a 256 llmule-* > SHA256SUMS   # every version in dist/: the server keeps them all
ls -l
