#!/usr/bin/env bash
#
# install-wctl.sh - Install wctl to ~/.local/bin. Run with --help for usage.
#

set -euo pipefail

usage() {
    cat << 'EOF'
Usage: install-wctl.sh [--local | --download | --help]

Install wctl to ~/.local/bin.

  (no argument)  Install a local build if there is one, else download
  --local        Force local install (builds cli/ if needed)
  --download     Force download from GitHub releases
  -h, --help     Show this help

Piped into bash (curl ... | bash), the script always downloads.

WCTL_VERSION selects the release to download: a tag such as v16, or latest.
The download is checked against the release's wctl.sha256 before it replaces
an installed wctl.

wctl is a statically linked binary. The published asset is x86_64 only; on any
other architecture, build it from source with --local.
EOF
}

# Colors for output (disabled if not a tty)
if [[ -t 1 ]]; then
    GREEN='\033[32m'
    YELLOW='\033[33m'
    RED='\033[31m'
    RESET='\033[0m'
else
    GREEN=''
    YELLOW=''
    RED=''
    RESET=''
fi

# Parse arguments
MODE="auto"
if [[ $# -gt 1 ]]; then
    echo -e "${RED}Error:${RESET} unexpected argument: $2" >&2
    usage >&2
    exit 2
fi
case "${1:-}" in
    --local) MODE="local" ;;
    --download) MODE="download" ;;
    -h|--help) usage; exit 0 ;;
    "") ;;
    *)
        echo -e "${RED}Error:${RESET} unknown argument: $1" >&2
        usage >&2
        exit 2
        ;;
esac

# Piped into bash there is no script file, so there is no checkout to install
# from. The current directory is not a fallback: piped from inside a checkout,
# it would install a stale local build.
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    LOCAL_BINARY="$SCRIPT_DIR/cli/target/release/wctl"
else
    SCRIPT_DIR=""
    LOCAL_BINARY=""
fi

INSTALL_DIR="$HOME/.local/bin"
GITHUB_REPO="carlo9890/gnome-window-control"
WCTL_VERSION="${WCTL_VERSION:-latest}"
if [[ "$WCTL_VERSION" == "latest" ]]; then
    RELEASE_URL="https://github.com/$GITHUB_REPO/releases/latest/download"
else
    RELEASE_URL="https://github.com/$GITHUB_REPO/releases/download/$WCTL_VERSION"
fi

echo "Installing wctl..."

# Create ~/.local/bin if it doesn't exist
if [[ ! -d "$INSTALL_DIR" ]]; then
    echo "Creating $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"
fi

# Build the binary from the checkout. The Rust toolchain is pinned in
# .mise.toml, so the build goes through mise.
build_local() {
    if [[ ! -f "$SCRIPT_DIR/cli/Cargo.toml" ]]; then
        echo -e "${RED}Error:${RESET} no wctl source at $SCRIPT_DIR/cli"
        echo "Run this script from a checkout of the repository, or use --download."
        exit 1
    fi

    if ! command -v mise &> /dev/null; then
        echo -e "${RED}Error:${RESET} mise is not installed; it provides the pinned Rust toolchain."
        echo "Install it from https://mise.jdx.dev, or use --download."
        exit 1
    fi

    echo "Building wctl from source..."
    (cd "$SCRIPT_DIR" && mise run build)
}

# fetch <url> <file>: "-" as the file writes to stdout
fetch() {
    if command -v curl &> /dev/null; then
        curl -fsSL "$1" -o "$2"
    else
        wget -q "$1" -O "$2"
    fi
}

# Determine source
WCTL_SOURCE=""

if [[ "$MODE" == "local" ]]; then
    if [[ -z "$SCRIPT_DIR" ]]; then
        echo -e "${RED}Error:${RESET} --local needs the script run from a checkout, not piped into bash."
        exit 1
    fi
    # Force local: build unless a binary is already there
    [[ -f "$LOCAL_BINARY" ]] || build_local
    if [[ -f "$LOCAL_BINARY" ]]; then
        WCTL_SOURCE="$LOCAL_BINARY"
    else
        echo -e "${RED}Error:${RESET} wctl not found at $LOCAL_BINARY after building"
        exit 1
    fi
elif [[ "$MODE" == "download" ]]; then
    # Force download
    WCTL_SOURCE="download"
elif [[ "$MODE" == "auto" ]]; then
    # Auto: use a local build if there is one, else download
    if [[ -n "$LOCAL_BINARY" && -f "$LOCAL_BINARY" ]]; then
        WCTL_SOURCE="$LOCAL_BINARY"
    else
        WCTL_SOURCE="download"
    fi
fi

# Install from source
if [[ "$WCTL_SOURCE" == "download" ]]; then
    # The published asset is a static x86_64 binary; nothing else is built yet.
    arch=$(uname -m)
    if [[ "$arch" != "x86_64" ]]; then
        echo -e "${RED}Error:${RESET} no published wctl binary for $arch (x86_64 only)."
        echo "Build it from a checkout instead: ./install-wctl.sh --local"
        exit 1
    fi

    if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
        echo -e "${RED}Error:${RESET} Neither curl nor wget found. Please install one of them."
        exit 1
    fi

    echo "Downloading wctl from GitHub releases ($WCTL_VERSION)..."

    # The download replaces an installed wctl only once it is known good, so a
    # failed, cut-off or wrong download leaves a working install in place.
    tmp=$(mktemp -p "$INSTALL_DIR" .wctl.XXXXXX)
    trap 'rm -f "$tmp"' EXIT

    if ! fetch "$RELEASE_URL/wctl" "$tmp" || ! checksum=$(fetch "$RELEASE_URL/wctl.sha256" -); then
        echo -e "${RED}Error:${RESET} Failed to download wctl from $RELEASE_URL"
        echo "Check your internet connection or try: curl -fsSL $RELEASE_URL/wctl"
        exit 1
    fi

    expected=${checksum%% *}
    actual=$(sha256sum "$tmp")
    actual=${actual%% *}
    if [[ "$actual" != "$expected" ]]; then
        echo -e "${RED}Error:${RESET} the downloaded wctl does not match $RELEASE_URL/wctl.sha256"
        echo "  expected: $expected"
        echo "  got:      $actual"
        exit 1
    fi

    chmod 755 "$tmp"
    if ! "$tmp" --version > /dev/null; then
        echo -e "${RED}Error:${RESET} the downloaded wctl does not run"
        exit 1
    fi

    mv -f "$tmp" "$INSTALL_DIR/wctl"
    echo -e "${GREEN}Downloaded wctl from GitHub${RESET}"
else
    echo "Copying wctl from $WCTL_SOURCE..."
    cp "$WCTL_SOURCE" "$INSTALL_DIR/wctl"
    chmod +x "$INSTALL_DIR/wctl"
fi

echo -e "${GREEN}Successfully installed wctl to $INSTALL_DIR/wctl${RESET}"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo ""
    echo -e "${YELLOW}Warning:${RESET} $INSTALL_DIR is not in your PATH."
    echo ""
    echo "Add it by adding this line to your ~/.bashrc or ~/.zshrc:"
    echo ""
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    echo "Then restart your shell or run:"
    echo ""
    echo "    source ~/.bashrc  # or source ~/.zshrc"
else
    echo ""
    echo "Run 'wctl --help' to get started."
fi
