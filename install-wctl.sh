#!/usr/bin/env bash
#
# install-wctl.sh - Install wctl to ~/.local/bin
#
# Usage:
#   ./install-wctl.sh              # Install from local directory or download from GitHub
#   ./install-wctl.sh --local      # Force local install (wctl must be in same directory)
#   ./install-wctl.sh --download   # Force download from GitHub releases
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"
GITHUB_REPO="carlo9890/gnome-window-control"
GITHUB_RELEASE_URL="https://github.com/$GITHUB_REPO/releases/latest/download/wctl"

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

# Determine source
WCTL_SOURCE=""

if [[ "$MODE" == "local" ]]; then
    # Force local
    if [[ -f "$SCRIPT_DIR/wctl" ]]; then
        WCTL_SOURCE="$SCRIPT_DIR/wctl"
    else
        echo -e "${RED}Error:${RESET} wctl not found in $SCRIPT_DIR"
        exit 1
    fi
elif [[ "$MODE" == "download" ]]; then
    # Force download
    WCTL_SOURCE="download"
elif [[ "$MODE" == "auto" ]]; then
    # Auto: try local first, then download
    if [[ -f "$SCRIPT_DIR/wctl" ]]; then
        WCTL_SOURCE="$SCRIPT_DIR/wctl"
    else
        WCTL_SOURCE="download"
    fi
fi

# Install from source
if [[ "$WCTL_SOURCE" == "download" ]]; then
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
