#!/bin/sh
set -eu

expected_revision=2f539596c6e9a977e91b6bc6344650422c6bc3b0
repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_root=${DRAWLOOM_LLAMA_SOURCE:-"$repository_root/../llama.cpp"}
output_root=${DRAWLOOM_LLAMA_OUTPUT:-"$repository_root/dist/llama-runtime"}
tauri_config="$repository_root/apps/desktop/src-tauri/tauri.conf.json"
deployment_target=$(sed -n 's/.*"minimumSystemVersion"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$tauri_config")
case "$deployment_target" in
  ''|*[!0-9.]*) echo "Invalid macOS deployment target in $tauri_config" >&2; exit 1 ;;
esac
patch_file="$repository_root/scripts/patches/llama-server-embedding-only.patch"
source_snapshot="$repository_root/dist/.llama-source-$expected_revision"
build_root="$output_root/build"
payload_root="$output_root/payload/drawloom-llama-runtime"
archive="$output_root/llama.cpp-darwin-arm64-$expected_revision.tar.gz"

if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo "The supported runtime build requires macOS on Apple Silicon." >&2
  exit 1
fi
if [ "$(git -C "$source_root" rev-parse HEAD)" != "$expected_revision" ]; then
  echo "llama.cpp must be checked out at $expected_revision." >&2
  exit 1
fi
if [ -n "$(git -C "$source_root" status --porcelain)" ]; then
  echo "llama.cpp source must be clean so the archive corresponds to its recorded revision." >&2
  exit 1
fi
if [ -e "$output_root" ] || [ -L "$output_root" ]; then
  echo "Output already exists; choose a new DRAWLOOM_LLAMA_OUTPUT or move it aside: $output_root" >&2
  exit 1
fi
if [ -e "$source_snapshot" ] || [ -L "$source_snapshot" ]; then
  echo "Pinned source staging is already in use: $source_snapshot" >&2
  exit 1
fi

mkdir -p -- "$(dirname -- "$output_root")"
mkdir -- "$output_root"
mkdir -p -- "$build_root" "$payload_root/bin"

source_snapshot_owned=0
cleanup_source_snapshot() {
  if [ "$source_snapshot_owned" -eq 1 ]; then
    git -C "$source_root" worktree remove --force "$source_snapshot"
    source_snapshot_owned=0
  fi
}
trap cleanup_source_snapshot EXIT HUP INT TERM
git -C "$source_root" worktree add --detach "$source_snapshot" "$expected_revision"
source_snapshot_owned=1
git -C "$source_snapshot" apply --check "$patch_file"
git -C "$source_snapshot" apply "$patch_file"

cmake -S "$source_snapshot" -B "$build_root" \
  -DCMAKE_OSX_DEPLOYMENT_TARGET="$deployment_target" \
  -DGGML_METAL_MACOSX_VERSION_MIN="$deployment_target" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_TOOLS=ON \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_BUILD_APP=OFF \
  -DLLAMA_BUILD_UI=OFF \
  -DLLAMA_USE_PREBUILT_UI=OFF \
  -DLLAMA_TOOLS_INSTALL=OFF \
  -DLLAMA_TESTS_INSTALL=OFF \
  -DLLAMA_OPENSSL=OFF \
  -DLLAMA_SUBPROCESS=OFF \
  -DLLAMA_LLGUIDANCE=OFF \
  -DGGML_METAL=ON \
  -DGGML_METAL_EMBED_LIBRARY=ON \
  -DGGML_OPENMP=OFF \
  -DGGML_OPENMP_FETCH=OFF \
  -DGGML_CPU_KLEIDIAI=OFF \
  -DGGML_BACKEND_DL=OFF \
  -DGGML_RPC=OFF \
  -DGGML_NATIVE=OFF \
  -DGGML_LLAMAFILE=OFF \
  -DGGML_CCACHE=OFF
cmake --build "$build_root" --config Release --target llama-server --parallel

cp -- "$build_root/bin/llama-server" "$payload_root/bin/llama-server"
cp -- "$source_snapshot/LICENSE" "$payload_root/LICENSE"
{
  echo "Bundled third-party notices"
  echo
  echo "cpp-httplib"
  echo "============"
  cat "$source_snapshot/vendor/cpp-httplib/LICENSE"
  echo
  echo "nlohmann/json"
  echo "============="
  cat "$source_snapshot/licenses/LICENSE-jsonhpp"
  echo
  echo "xxHash"
  echo "======"
  cat "$source_snapshot/vendor/hash/xxhash/LICENSE"
  echo
  echo "SHA-1 implementation"
  echo "===================="
  sed -n '1,34p' "$source_snapshot/vendor/hash/sha1/sha1.h"
  echo
  echo "SHA-256 implementation"
  echo "======================"
  cat "$source_snapshot/vendor/hash/sha256/LICENSE"
  echo
  echo "rotate-bits"
  echo "==========="
  cat "$source_snapshot/vendor/hash/rotate-bits/LICENSE.md"
  echo
  echo "stb_image"
  echo "========="
  tail -n 45 "$source_snapshot/vendor/stb/stb_image.h"
  echo
  echo "miniaudio"
  echo "========="
  tail -n 50 "$source_snapshot/vendor/miniaudio/miniaudio.h"
} > "$payload_root/THIRD_PARTY_NOTICES.txt"
cleanup_source_snapshot
trap - EXIT HUP INT TERM
chmod 700 "$payload_root/bin/llama-server"
chmod 600 "$payload_root/LICENSE" "$payload_root/THIRD_PARTY_NOTICES.txt"
find "$output_root/payload" -exec touch -h -t 202001010000.00 {} +

COPYFILE_DISABLE=1 /usr/bin/tar -C "$output_root/payload" -cf "$output_root/runtime.tar" \
  drawloom-llama-runtime
/usr/bin/gzip -n -9 "$output_root/runtime.tar"
mv -- "$output_root/runtime.tar.gz" "$archive"

archive_bytes=$(stat -f %z "$archive")
archive_sha256=$(shasum -a 256 "$archive" | awk '{print $1}')
binary_sha256=$(shasum -a 256 "$payload_root/bin/llama-server" | awk '{print $1}')
cat > "$output_root/runtime-manifest.json" <<EOF
{
  "id": "llama.cpp-darwin-arm64",
  "revision": "$expected_revision",
  "platform": "darwin",
  "arch": "arm64",
  "bytes": $archive_bytes,
  "sha256": "$archive_sha256",
  "binarySha256": "$binary_sha256"
}
EOF

echo "Archive: $archive"
echo "Bytes: $archive_bytes"
echo "SHA-256: $archive_sha256"
echo "Manifest: $output_root/runtime-manifest.json"
