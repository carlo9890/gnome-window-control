#!/usr/bin/env bash
#
# Build script for GNOME Window Control extension
# Creates a distributable zip file for installation
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$PROJECT_ROOT/window-control@carlo9890.github.io"
DIST_DIR="$PROJECT_ROOT/dist"

# Extension metadata
EXTENSION_UUID="window-control@carlo9890.github.io"

# Colors for output
# Colors (disabled if not a tty)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    RESET='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    RESET=''
fi

log_info() {
    echo -e "${GREEN}[INFO]${RESET} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${RESET} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${RESET} $1"
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

    # Syntax-check every JS source. docs/CODING.md marks this CRITICAL; run it here
    # so `build.sh all` (and therefore CI) fails on a syntax error before packaging.
    if command -v node >/dev/null 2>&1; then
        local js
        for js in "$EXTENSION_DIR"/*.js; do
            if ! node --check "$js"; then
                log_error "JavaScript syntax error in: $js"
                exit 1
            fi
        done
        log_info "JavaScript syntax check passed (node --check)!"
    else
        log_warn "node not found; skipping JavaScript syntax check (install node to enable it)"
    fi

    # The interface XML lives inside a JS template literal, so a backtick or a
    # ${...} in one of its comments ends the string early or interpolates. That
    # is NOT caught by node --check: the file can still parse, and the damage
    # only shows up as a SyntaxError inside GJS when the shell loads it -- the
    # extension then reports state ERROR and serves nothing. Two delimiters are
    # expected; anything else is the bug.
    #
    # grep -o, not grep -c: -c counts matching LINES, so a second backtick on
    # either delimiter line would leave the count at 2 and pass a broken file.
    local ticks
    ticks=$(grep -o '`' "$EXTENSION_DIR/dbus-interface.js" | wc -l)
    if [[ "$ticks" -ne 2 ]]; then
        log_error "dbus-interface.js has $ticks backtick(s), expected 2 (the template delimiters)."
        log_error "A backtick inside the XML ends the template literal early; use a single quote."
        exit 1
    fi
    if grep -q '\${' "$EXTENSION_DIR/dbus-interface.js"; then
        log_error "dbus-interface.js contains \${...}: the template literal would interpolate it."
        exit 1
    fi
    log_info "Interface XML template literal is intact!"

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
