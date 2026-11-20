#!/bin/sh
# Copies the mod into herdr (mods can't import across folders, so the "down" variant gets its own copy of main.js).
set -e
here=$(cd "$(dirname "$0")" && pwd)
mods="${HERDR_HOME:-$HOME/.config/herdr-app}/mods"
mkdir -p "$mods/split-picker" "$mods/split-picker-down"
cp "$here/mods/split-picker/main.js" "$here/mods/split-picker/mod.json" "$mods/split-picker/"
cp "$here/mods/split-picker/main.js" "$mods/split-picker-down/"
sed 's/"right"/"down"/; s/"Split picker"/"Split picker (down)"/' "$here/mods/split-picker/mod.json" > "$mods/split-picker-down/mod.json"
herdr-app check "$mods/split-picker"
herdr-app check "$mods/split-picker-down"
echo "Installed. Bind keys in keys.json: \"ctrl-shift-o\": \"mod.open:split-picker\", \"ctrl-shift-e\": \"mod.open:split-picker-down\""
