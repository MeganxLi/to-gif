#!/bin/sh
set -eu

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
local_tools="${THREADS_TO_GIF_TOOLS_DIR:-$HOME/Library/Caches/threads-to-gif/dev-tools}"
uv_bin="$local_tools/uv"

export XDG_CONFIG_HOME="$local_tools/config"
export UV_CACHE_DIR="$local_tools/cache"
export UV_PYTHON_INSTALL_DIR="$local_tools/python"
export UV_PYTHON_BIN_DIR="$local_tools"

# Keep uv out of the system Python installation. Vercel CLI otherwise tries
# `pip install --user uv`, which macOS rejects for externally managed Python.
if [ ! -x "$uv_bin" ]; then
	mkdir -p "$local_tools"
	curl -LsSf https://astral.sh/uv/0.13.5/install.sh | env UV_INSTALL_DIR="$local_tools" UV_NO_MODIFY_PATH=1 sh
fi

"$uv_bin" python install 3.12
python312="$("$uv_bin" python find 3.12)"
ln -sf "$python312" "$local_tools/python3"

# uv is discoverable before Vercel starts; Python 3.12 is selected for its
# local function bootstrap without installing anything into macOS Python.
export PATH="$local_tools:$PATH"
port="${PORT:-3001}"
exec npx vercel dev --listen "$port"
