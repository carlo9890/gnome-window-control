#!/usr/bin/env bash
#
# install-wctl.sh - Install wctl to ~/.local/bin
#
# Usage:
#   ./install-wctl.sh              # Install a local build if there is one, else download
#   ./install-wctl.sh --local      # Force local install (builds cli/ if needed)
#   ./install-wctl.sh --download   # Force download from GitHub releases
#
# wctl is a statically linked binary. The published asset is x86_64 only; on any
# other architecture, build it from source with --local.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"
GITHUB_REPO="carlo9890/gnome-window-control"
GITHUB_RELEASE_URL="https://github.com/$GITHUB_REPO/releases/latest/download/wctl"
LOCAL_BINARY="$SCRIPT_DIR/cli/target/release/wctl"

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
if [[ "${1:-}" == "--local" ]]; then
    MODE="local"
elif [[ "${1:-}" == "--download" ]]; then
    MODE="download"
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

# Determine source
WCTL_SOURCE=""

if [[ "$MODE" == "local" ]]; then
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
    if [[ -f "$LOCAL_BINARY" ]]; then
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

    echo "Downloading wctl from GitHub releases..."
    
    # Check for curl or wget
    if command -v curl &> /dev/null; then
        if ! curl -fsSL "$GITHUB_RELEASE_URL" -o "$INSTALL_DIR/wctl"; then
            echo -e "${RED}Error:${RESET} Failed to download wctl from $GITHUB_RELEASE_URL"
            echo "Check your internet connection or try: curl -fsSL $GITHUB_RELEASE_URL"
            exit 1
        fi
    elif command -v wget &> /dev/null; then
        if ! wget -q "$GITHUB_RELEASE_URL" -O "$INSTALL_DIR/wctl"; then
            echo -e "${RED}Error:${RESET} Failed to download wctl from $GITHUB_RELEASE_URL"
            exit 1
        fi
    else
        echo -e "${RED}Error:${RESET} Neither curl nor wget found. Please install one of them."
        exit 1
    fi
    
    echo -e "${GREEN}Downloaded wctl from GitHub${RESET}"
else
    echo "Copying wctl from $WCTL_SOURCE..."
    cp "$WCTL_SOURCE" "$INSTALL_DIR/wctl"
fi

# Make it executable
chmod +x "$INSTALL_DIR/wctl"

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
