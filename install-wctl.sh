#!/usr/bin/env bash
#
# install-wctl.sh - Install wctl to ~/.local/bin
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"

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

echo "Installing wctl..."

# Check if wctl exists in script directory
if [[ ! -f "$SCRIPT_DIR/wctl" ]]; then
    echo -e "${RED}Error:${RESET} wctl not found in $SCRIPT_DIR"
    exit 1
fi

# Create ~/.local/bin if it doesn't exist
if [[ ! -d "$INSTALL_DIR" ]]; then
    echo "Creating $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"
fi

# Copy wctl to ~/.local/bin
echo "Copying wctl to $INSTALL_DIR..."
cp "$SCRIPT_DIR/wctl" "$INSTALL_DIR/wctl"

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
