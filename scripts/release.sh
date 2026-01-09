#!/usr/bin/env bash
#
# Release script for GNOME Window Control
# Creates GitHub releases with all required assets
#
# IMPORTANT: All releases MUST be created using this script
# to ensure all required assets are included.
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
BLUE='\033[0;34m'
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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Show help
usage() {
    cat << EOF
GNOME Window Control Release Script

Usage: $0 [options]

Creates a GitHub release with all required assets:
  - Extension zip file (dist/window-control@hko9890_v<version>.zip)
  - wctl CLI script
  - install-wctl.sh installer

Prerequisites:
  - GitHub CLI (gh) installed and authenticated
  - Clean working directory (no uncommitted changes)
  - On main branch
  - Git tag v<version> must exist (matching metadata.json version)

Options:
    -h, --help    Show this help message

Release Process:
    1. Update version in window-control@hko9890/metadata.json
    2. Update CHANGELOG.md with release notes
    3. Commit: git commit -am "chore: bump version to vX"
    4. Create tag: git tag vX
    5. Push: git push && git push --tags
    6. Run: $0
EOF
}

# Check if gh CLI is installed and authenticated
check_gh_cli() {
    log_step "Checking GitHub CLI..."
    
    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI (gh) is not installed."
        log_error "Install it from: https://cli.github.com/"
        exit 1
    fi
    
    if ! gh auth status &> /dev/null; then
        log_error "GitHub CLI is not authenticated."
        log_error "Run: gh auth login"
        exit 1
    fi
    
    log_info "GitHub CLI is installed and authenticated"
}

# Check we're on main branch
check_main_branch() {
    log_step "Checking branch..."
    
    local current_branch
    current_branch=$(git -C "$PROJECT_ROOT" branch --show-current)
    
    if [[ "$current_branch" != "main" ]]; then
        log_error "Must be on main branch to release."
        log_error "Current branch: $current_branch"
        exit 1
    fi
    
    log_info "On main branch"
}

# Check working directory is clean
check_clean_workdir() {
    log_step "Checking working directory..."
    
    if ! git -C "$PROJECT_ROOT" diff --quiet || ! git -C "$PROJECT_ROOT" diff --cached --quiet; then
        log_error "Working directory has uncommitted changes."
        log_error "Commit or stash changes before releasing."
        git -C "$PROJECT_ROOT" status --short
        exit 1
    fi
    
    # Check for untracked files (excluding dist/)
    local untracked
    untracked=$(git -C "$PROJECT_ROOT" ls-files --others --exclude-standard | grep -v "^dist/" || true)
    if [[ -n "$untracked" ]]; then
        log_warn "Untracked files found (not in dist/):"
        echo "$untracked"
        log_warn "Consider adding them to .gitignore or committing them"
    fi
    
    log_info "Working directory is clean"
}

# Get version from metadata.json
get_version() {
    log_step "Reading version..."
    
    if [[ ! -f "$EXTENSION_DIR/metadata.json" ]]; then
        log_error "metadata.json not found!"
        exit 1
    fi
    
    VERSION=$(python3 -c "import json; print(json.load(open('$EXTENSION_DIR/metadata.json'))['version'])")
    TAG="v${VERSION}"
    ZIP_NAME="${EXTENSION_UUID}_v${VERSION}.zip"
    ZIP_PATH="$DIST_DIR/$ZIP_NAME"
    
    log_info "Version: $VERSION (tag: $TAG)"
}

# Check git tag exists
check_tag_exists() {
    log_step "Checking git tag..."
    
    if ! git -C "$PROJECT_ROOT" rev-parse "$TAG" &> /dev/null; then
        log_error "Git tag '$TAG' does not exist."
        log_error "Create the tag first:"
        log_error "  git tag $TAG"
        log_error "  git push --tags"
        exit 1
    fi
    
    log_info "Tag $TAG exists"
}

# Build the extension
build_extension() {
    log_step "Building extension..."
    
    "$SCRIPT_DIR/build.sh" all
    
    if [[ ! -f "$ZIP_PATH" ]]; then
        log_error "Build failed: $ZIP_PATH not found"
        exit 1
    fi
    
    log_info "Build successful: $ZIP_PATH"
}

# Validate all release assets exist
validate_assets() {
    log_step "Validating release assets..."
    
    local missing=0
    
    # Check extension zip
    if [[ ! -f "$ZIP_PATH" ]]; then
        log_error "Missing: $ZIP_PATH"
        missing=1
    else
        log_info "Found: $ZIP_PATH"
    fi
    
    # Check wctl
    if [[ ! -f "$PROJECT_ROOT/wctl" ]]; then
        log_error "Missing: wctl"
        missing=1
    else
        log_info "Found: wctl"
    fi
    
    # Check install-wctl.sh
    if [[ ! -f "$PROJECT_ROOT/install-wctl.sh" ]]; then
        log_error "Missing: install-wctl.sh"
        missing=1
    else
        log_info "Found: install-wctl.sh"
    fi
    
    if [[ $missing -eq 1 ]]; then
        log_error "Some release assets are missing. Cannot proceed."
        exit 1
    fi
    
    log_info "All 3 release assets validated"
}

# Extract release notes from CHANGELOG.md
extract_release_notes() {
    log_step "Extracting release notes from CHANGELOG.md..."
    
    local changelog="$PROJECT_ROOT/CHANGELOG.md"
    
    if [[ ! -f "$changelog" ]]; then
        log_warn "CHANGELOG.md not found, using default release notes"
        RELEASE_NOTES="Release $TAG"
        return
    fi
    
    # Extract section for this version (between ## v<version> and next ## or end of file)
    # Using awk to extract the section
    RELEASE_NOTES=$(awk -v ver="## $TAG" '
        $0 ~ ver {found=1; next}
        found && /^## / {exit}
        found {print}
    ' "$changelog" | sed '/^$/N;/^\n$/d')
    
    if [[ -z "$RELEASE_NOTES" ]]; then
        log_warn "No release notes found for $TAG in CHANGELOG.md"
        RELEASE_NOTES="Release $TAG"
    else
        log_info "Found release notes for $TAG"
    fi
}

# Check if release already exists
check_existing_release() {
    log_step "Checking for existing release..."
    
    if gh release view "$TAG" &> /dev/null; then
        log_warn "Release $TAG already exists!"
        echo ""
        read -p "Do you want to delete and recreate it? (y/N): " confirm
        if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
            log_error "Aborted by user"
            exit 1
        fi
        
        log_info "Deleting existing release..."
        gh release delete "$TAG" --yes
        log_info "Existing release deleted"
    else
        log_info "No existing release for $TAG"
    fi
}

# Create the GitHub release
create_release() {
    log_step "Creating GitHub release..."
    
    # Get repo name for URLs
    local repo_name
    repo_name=$(gh repo view --json nameWithOwner -q .nameWithOwner)
    
    # Build release body with notes and installation instructions
    local body
    body=$(cat << EOF
$RELEASE_NOTES

## Installation

### Extension

1. Download \`$ZIP_NAME\` below
2. Install: \`gnome-extensions install $ZIP_NAME\`
3. Log out and back in (Wayland) or press Alt+F2, type \`r\`, Enter (X11)
4. Enable: \`gnome-extensions enable $EXTENSION_UUID\`

### wctl CLI

**Quick install:**
\`\`\`bash
curl -fsSL https://github.com/$repo_name/releases/download/$TAG/install-wctl.sh | bash
\`\`\`

**Manual install:**
1. Download \`wctl\` below
2. Make executable: \`chmod +x wctl\`
3. Move to PATH: \`sudo mv wctl /usr/local/bin/\`

## Assets

| File | Description |
|------|-------------|
| \`$ZIP_NAME\` | GNOME Shell extension (installable zip) |
| \`wctl\` | Command-line interface for window control |
| \`install-wctl.sh\` | One-line installer script for wctl |
EOF
    )
    
    # Create release with all assets
    gh release create "$TAG" \
        --title "GNOME Window Control $TAG" \
        --notes "$body" \
        "$ZIP_PATH" \
        "$PROJECT_ROOT/wctl" \
        "$PROJECT_ROOT/install-wctl.sh"
    
    log_info "Release $TAG created!"
}

# Verify the release
verify_release() {
    log_step "Verifying release..."
    
    echo ""
    log_info "Release details:"
    gh release view "$TAG"
    
    echo ""
    log_info "Release assets:"
    local asset_count
    asset_count=$(gh release view "$TAG" --json assets -q '.assets | length')
    gh release view "$TAG" --json assets -q '.assets[].name' | while read -r asset; do
        echo "  - $asset"
    done
    
    echo ""
    if [[ "$asset_count" -eq 3 ]]; then
        log_info "Verified: All 3 assets uploaded successfully"
    else
        log_error "Expected 3 assets, found $asset_count"
        exit 1
    fi
    
    echo ""
    log_info "Release URL:"
    gh release view "$TAG" --json url -q '.url'
}

# Main
main() {
    # Check for help flag
    if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
        usage
        exit 0
    fi
    
    echo ""
    echo "=========================================="
    echo "  GNOME Window Control Release Script"
    echo "=========================================="
    echo ""
    
    cd "$PROJECT_ROOT"
    
    # Step 1: Validate prerequisites
    check_gh_cli
    check_main_branch
    check_clean_workdir
    
    # Step 2: Get version info
    get_version
    check_tag_exists
    
    # Step 3: Build the extension
    build_extension
    
    # Step 4: Validate all assets
    validate_assets
    
    # Step 5: Extract release notes
    extract_release_notes
    
    # Step 6: Check for existing release
    check_existing_release
    
    # Step 7: Create the release
    create_release
    
    # Step 8: Verify the release
    verify_release
    
    echo ""
    echo "=========================================="
    log_info "Release $TAG completed successfully!"
    echo "=========================================="
}

main "$@"
