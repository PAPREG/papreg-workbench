#!/usr/bin/env bash
# The public bundle: the tracked files the site serves (index.html, js/, fonts/, config.json, sample/) plus build.json, whose hash is the content hash of those files
# and is appended to the image URLs (cache busting). The real image (page.jpg) and the ink strips (strips/) are never part of it, tracked or not.
#   tools/build_public.sh <outdir>   build the bundle from the tracked files
#   tools/build_public.sh --write    (re)write build.json from the tracked files (commit it)
#   tools/build_public.sh --check    exit 1 when build.json is not the hash of the tracked files
set -eu
cd "$(dirname "$0")/.."
FILES=$(git ls-files -- index.html js fonts config.json sample | grep -v -E '(^|/)page\.jpg$|(^|/)strips/' | LC_ALL=C sort)
HASH=$( { for f in $FILES; do sha256sum "$f"; done; } | sha256sum | cut -c1-12 )
case "${1:-}" in
  --write) printf '{"hash":"%s"}\n' "$HASH" > build.json; echo "build.json: $HASH" ;;
  --check) CUR=$(sed -n 's/.*"hash":"\([0-9a-f]*\)".*/\1/p' build.json 2>/dev/null || true)
           [ "$CUR" = "$HASH" ] && echo "build.json is current ($HASH)" || { echo "build.json is stale (file $CUR, tracked files $HASH): run tools/build_public.sh --write and commit"; exit 1; } ;;
  "")      echo "usage: tools/build_public.sh <outdir> | --write | --check"; exit 2 ;;
  *)       OUT=$1; rm -rf "$OUT"; mkdir -p "$OUT"; for f in $FILES build.json; do mkdir -p "$OUT/$(dirname "$f")"; cp "$f" "$OUT/$f"; done; echo "public bundle in $OUT ($(echo "$FILES" | wc -l) files, build $HASH)" ;;
esac
