#!/usr/bin/env bash
#
# Update script for GNOME Window Control extension
# Builds, installs locally, and reloads the extension for testing
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$PROJECT_ROOT/window-control@hko9890"
EXTENSION_UUID="window-control@hko9890"
TARGET_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

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
    
    log_info "Validation passed!"
}

# Copy extension to local install directory
install_local() {
    log_info "Copying extension to $TARGET_DIR..."
    
    # Create target directory if it doesn't exist
    mkdir -p "$TARGET_DIR"
    
    # Copy all files
    cp -r "$EXTENSION_DIR"/* "$TARGET_DIR/"
    
    log_info "Extension files updated"
}

# Reload the extension (disable then enable)
reload_extension() {
    log_info "Reloading extension..."
    
    # Check if extension is currently enabled
    if gnome-extensions info "$EXTENSION_UUID" 2>/dev/null | grep -q "Enabled: Yes"; then
        gnome-extensions disable "$EXTENSION_UUID"
        log_info "Disabled extension"
    fi
    
    gnome-extensions enable "$EXTENSION_UUID"
    log_info "Enabled extension"
}

# Check extension status
check_status() {
    log_info "Extension status:"
    gnome-extensions info "$EXTENSION_UUID" 2>&1 || log_error "Extension not found"
}

# Check for errors in logs
check_logs() {
    log_info "Recent extension logs:"
    journalctl --user -b -g "Window Control|window-control" --no-pager -n 10 2>/dev/null || \
    journalctl -b -g "Window Control|window-control" --no-pager -n 10 2>/dev/null || \
    log_warn "Could not read logs"
}

# Test D-Bus interface
test_dbus() {
    log_info "Testing D-Bus interface..."
    
    local result
    result=$(gdbus call --session \
        --dest org.gnome.Shell \
        --object-path /org/gnome/Shell/Extensions/WindowControl \
        --method org.gnome.Shell.Extensions.WindowControl.GetFocused 2>&1)
    
    if [[ "$result" == *"error"* ]] || [[ "$result" == *"Error"* ]]; then
        log_error "D-Bus test failed: $result"
        return 1
    else
        log_info "D-Bus test passed: $result"
        return 0
    fi
}

# Main update function
update() {
    validate
    install_local
    reload_extension
    sleep 1  # Give extension time to initialize
    check_status
    test_dbus
    log_info "Update complete!"
}

# Show help
usage() {
    cat << EOF
GNOME Window Control Extension Update Script

Usage: $0 [command]

Commands:
    update      Validate, install, and reload extension (default)
    validate    Only validate extension files
    install     Only copy files to local extension directory
    reload      Only reload the extension (disable/enable)
    status      Show extension status
    logs        Show recent extension logs
    test        Test D-Bus interface
    help        Show this help message

Examples:
    $0              # Full update (validate + install + reload + test)
    $0 reload       # Just reload without copying files
    $0 logs         # Check for errors in logs
EOF
}

# Main
main() {
    local command="${1:-update}"
    
    case "$command" in
        update)
            update
            ;;
        validate)
            validate
            ;;
        install)
            install_local
            ;;
        reload)
            reload_extension
            ;;
        status)
            check_status
            ;;
        logs)
            check_logs
            ;;
        test)
            test_dbus
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
