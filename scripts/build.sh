#!/usr/bin/env bash
#
# Build script for GNOME Window Control extension
# Creates a distributable zip file for installation
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$PROJECT_ROOT/window-control@hko9890"
DIST_DIR="$PROJECT_ROOT/dist"

# Extension metadata
EXTENSION_UUID="window-control@hko9890"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Clean previous build
clean() {
    log_info "Cleaning previous build..."
    rm -rf "$DIST_DIR"
    mkdir -p "$DIST_DIR"
}

# Validate extension files
validate() {
    log_info "Validating extension files..."
    
    if [[ ! -f "$EXTENSION_DIR/metadata.json" ]]; then
        log_error "metadata.json not found!"
        exit 1
    fi
    
    if [[ ! -f "$EXTENSION_DIR/extension.js" ]]; then
        log_error "extension.js not found!"
        exit 1
    fi
    
    # Validate JSON syntax
    if ! python3 -c "import json; json.load(open('$EXTENSION_DIR/metadata.json'))" 2>/dev/null; then
        log_error "metadata.json is not valid JSON!"
        exit 1
    fi
    
    # Check UUID matches directory name
    local uuid
    uuid=$(python3 -c "import json; print(json.load(open('$EXTENSION_DIR/metadata.json'))['uuid'])")
    if [[ "$uuid" != "$EXTENSION_UUID" ]]; then
        log_error "UUID mismatch: expected $EXTENSION_UUID, got $uuid"
        exit 1
    fi
    
    log_info "Validation passed!"
}

# Build the extension zip
build() {
    log_info "Building extension..."
    
    local version
    version=$(python3 -c "import json; print(json.load(open('$EXTENSION_DIR/metadata.json'))['version'])")
    local zip_name="${EXTENSION_UUID}_v${version}.zip"
    local zip_path="$DIST_DIR/$zip_name"
    
    # Create zip file
    cd "$EXTENSION_DIR"
    zip -r "$zip_path" . -x "*.git*" -x "*.DS_Store"
    cd "$PROJECT_ROOT"
    
    log_info "Built: $zip_path"
    
    # Also create a latest symlink
    ln -sf "$zip_name" "$DIST_DIR/${EXTENSION_UUID}.zip"
    
    # Print zip contents
    log_info "Zip contents:"
    unzip -l "$zip_path"
    
    # Print file size
    local size
    size=$(du -h "$zip_path" | cut -f1)
    log_info "Size: $size"
}

# Install locally (for development)
install_local() {
    log_info "Installing extension locally..."
    
    local target_dir="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
    
    # Remove existing installation
    rm -rf "$target_dir"
    
    # Copy extension
    cp -r "$EXTENSION_DIR" "$target_dir"
    
    log_info "Installed to: $target_dir"
    log_warn "Restart GNOME Shell and run: gnome-extensions enable $EXTENSION_UUID"
}

# Install from built zip
install_zip() {
    local zip_path="$DIST_DIR/${EXTENSION_UUID}.zip"
    
    if [[ ! -f "$zip_path" ]]; then
        log_error "Build first: ./build.sh build"
        exit 1
    fi
    
    log_info "Installing from zip..."
    gnome-extensions install "$zip_path" --force
    log_info "Installed! Restart GNOME Shell and enable the extension."
}

# Uninstall
uninstall() {
    log_info "Uninstalling extension..."
    gnome-extensions uninstall "$EXTENSION_UUID" 2>/dev/null || true
    rm -rf "$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
    log_info "Uninstalled!"
}

# Show help
usage() {
    cat << EOF
GNOME Window Control Extension Build Script

Usage: $0 <command>

Commands:
    clean       Remove previous build artifacts
    validate    Validate extension files
    build       Build distributable zip file
    install     Install extension locally (development)
    install-zip Install from built zip file
    uninstall   Remove installed extension
    all         Clean, validate, and build
    help        Show this help message

Examples:
    $0 build              # Build the extension zip
    $0 all                # Full build pipeline
    $0 install            # Install for development
EOF
}

# Main
main() {
    local command="${1:-help}"
    
    case "$command" in
        clean)
            clean
            ;;
        validate)
            validate
            ;;
        build)
            clean
            validate
            build
            ;;
        install)
            install_local
            ;;
        install-zip)
            install_zip
            ;;
        uninstall)
            uninstall
            ;;
        all)
            clean
            validate
            build
            log_info "Build complete!"
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"
