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
EXTENSION_DIR="$PROJECT_ROOT/window-control@carlo9890.github.io"
DIST_DIR="$PROJECT_ROOT/dist"
# The wctl release asset is a static x86_64 binary. aarch64 is not published.
CLI_TARGET="x86_64-unknown-linux-musl"
CLI_BINARY="$PROJECT_ROOT/cli/target/$CLI_TARGET/release/wctl"

# Extension metadata
EXTENSION_UUID="window-control@carlo9890.github.io"

# Release notes file, given with --notes-file. There is no CHANGELOG.md: the
# notes are written by hand for each release (see docs/RELEASING.md).
NOTES_FILE=""

# Colors for output
# Colors (disabled if not a tty)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    RESET='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
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

log_step() {
    echo -e "${BLUE}[STEP]${RESET} $1"
}

# Show help
usage() {
    cat << EOF
GNOME Window Control Release Script

Usage: $0 --notes-file <path> [options]

Creates a GitHub release with all required assets:
  - Extension zip file (dist/window-control@carlo9890.github.io_v<version>.zip)
  - wctl CLI binary (statically linked, x86_64)
  - install-wctl.sh installer

Prerequisites:
  - GitHub CLI (gh) installed and authenticated
  - Clean working directory (no uncommitted changes)
  - On main branch
  - Git tag v<version> must exist (matching metadata.json version)
  - Release notes written by hand in a file (see docs/RELEASING.md)

Options:
    --notes-file <path>   File holding the release notes. Required.
                          Read the commits in the release and write what a user
                          would notice; do not paste a commit log. The script
                          appends the install instructions, so leave those out.
    -h, --help            Show this help message

Release Process:
    1a. Update version in window-control@carlo9890.github.io/metadata.json
        (both "version" and "version-name")
    1b. Update version in cli/Cargo.toml to match (e.g., "0.X.0" for metadata version X)
    1c. Refresh cli/Cargo.lock so it agrees with the manifest:
        (cd cli && cargo update -p wctl)
        Skipping this leaves the tag shipping a lock that pins the old version,
        and the release build rewrites it afterwards, dirtying the tree.
    2. Commit: git commit -am "chore: bump version to vX"
    3. Create tag: git tag vX
    4. Push: git push && git push --tags
    5. Write the release notes from the commits in the release:
       git log --oneline v<X-1>..vX
       Keep the notes out of the repository; /tmp is the right home for them.
    6. Run: $0 --notes-file /tmp/vX-notes.md
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

# Check the wctl crate version matches metadata.json version
check_wctl_version() {
    log_step "Checking wctl version..."

    local manifest="$PROJECT_ROOT/cli/Cargo.toml"

    if [[ ! -f "$manifest" ]]; then
        log_error "cli/Cargo.toml not found at $manifest"
        exit 1
    fi

    # Extract the package version (first `version = "..."` under [package])
    local wctl_version
    wctl_version=$(awk -F'"' '/^\[package\]/{p=1; next} /^\[/{p=0} p && /^version[[:space:]]*=/{print $2; exit}' "$manifest")

    if [[ -z "$wctl_version" ]]; then
        log_error "Could not extract version from cli/Cargo.toml"
        exit 1
    fi

    # Expected version is 0.<metadata_version>.0
    local expected_version="0.${VERSION}.0"

    if [[ "$wctl_version" != "$expected_version" ]]; then
        log_error "wctl version mismatch!"
        log_error "  cli/Cargo.toml: $wctl_version"
        log_error "  Expected:       $expected_version"
        log_error "Update the version in cli/Cargo.toml before releasing."
        exit 1
    fi

    log_info "wctl version matches: $wctl_version"
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

# Build the wctl binary as a static x86_64 executable.
#
# Static, because the release asset must run on any distribution without
# matching a glibc version; musl is the only target that gives that, and zbus
# is pure Rust so it needs no C toolchain.
build_cli() {
    log_step "Building wctl (x86_64-unknown-linux-musl)..."

    if ! command -v mise &> /dev/null; then
        log_error "mise is not installed; it provides the pinned Rust toolchain."
        log_error "Install it from: https://mise.jdx.dev"
        exit 1
    fi

    mise install
    mise exec -- rustup target add "$CLI_TARGET"
    (cd "$PROJECT_ROOT/cli" && mise exec -- cargo build --release --target "$CLI_TARGET")

    if [[ ! -f "$CLI_BINARY" ]]; then
        log_error "Build failed: $CLI_BINARY not found"
        exit 1
    fi

    # A dynamically linked asset would break on any host with an older glibc,
    # so refuse to publish one. The musl target produces a static PIE, which
    # `file` reports as "static-pie linked", not "statically linked" -- match
    # both, and reject the dynamic case by its own marker so a future `file`
    # wording change fails loudly here rather than shipping a dynamic binary.
    local linkage
    linkage=$(file "$CLI_BINARY")
    if [[ "$linkage" == *"dynamically linked"* ]] ||
       ! [[ "$linkage" == *"statically linked"* || "$linkage" == *"static-pie linked"* ]]; then
        log_error "wctl is not statically linked:"
        log_error "  $linkage"
        exit 1
    fi

    log_info "Build successful: $CLI_BINARY ($(du -h "$CLI_BINARY" | cut -f1), statically linked)"
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
    if [[ ! -f "$CLI_BINARY" ]]; then
        log_error "Missing: $CLI_BINARY"
        missing=1
    else
        log_info "Found: $CLI_BINARY"
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

# Read the release notes from the file given with --notes-file.
#
# There is no CHANGELOG.md and no generated notes: what a release changed for a
# user cannot be derived from commit subjects, so a human (or an agent) reads
# the commits and writes the notes. Missing notes are a hard failure -- a
# release with a placeholder body is worse than no release.
read_release_notes() {
    log_step "Reading release notes..."

    if [[ -z "$NOTES_FILE" ]]; then
        log_error "No release notes given."
        log_error "Write them from the commits in this release:"
        log_error "  git log --oneline <previous tag>..HEAD"
        log_error "Then pass the file: $0 --notes-file <path>"
        log_error "See docs/RELEASING.md for what belongs in them."
        exit 1
    fi

    if [[ ! -f "$NOTES_FILE" ]]; then
        log_error "Release notes file not found: $NOTES_FILE"
        exit 1
    fi

    RELEASE_NOTES=$(cat "$NOTES_FILE")

    if [[ -z "${RELEASE_NOTES//[[:space:]]/}" ]]; then
        log_error "Release notes file is empty: $NOTES_FILE"
        exit 1
    fi

    log_info "Read $(wc -l < "$NOTES_FILE") lines from $NOTES_FILE"
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

## Install

Extension:

\`\`\`bash
gnome-extensions install $ZIP_NAME
\`\`\`

Log out and back in (Wayland), or press Alt+F2, type \`r\`, Enter (X11), then:

\`\`\`bash
gnome-extensions enable $EXTENSION_UUID
\`\`\`

wctl:

\`\`\`bash
curl -fsSL https://github.com/$repo_name/releases/download/$TAG/install-wctl.sh | bash
\`\`\`
EOF
    )
    
    # Create release with all assets
    gh release create "$TAG" \
        --title "GNOME Window Control $TAG" \
        --notes "$body" \
        "$ZIP_PATH" \
        "$CLI_BINARY" \
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

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                usage
                exit 0
                ;;
            --notes-file)
                if [[ -z "${2:-}" ]]; then
                    log_error "--notes-file needs a path"
                    exit 1
                fi
                NOTES_FILE="$2"
                shift 2
                ;;
            *)
                log_error "Unknown option: $1"
                echo ""
                usage
                exit 1
                ;;
        esac
    done
}

# Main
main() {
    parse_args "$@"
    
    echo ""
    echo "=========================================="
    echo "  GNOME Window Control Release Script"
    echo "=========================================="
    echo ""
    
    cd "$PROJECT_ROOT"
    
    # Step 1: Validate prerequisites
    read_release_notes
    check_gh_cli
    check_main_branch
    check_clean_workdir
    
    # Step 2: Get version info
    get_version
    check_wctl_version
    check_tag_exists
    
    # Step 3: Build the release artifacts
    build_extension
    build_cli
    
    # Step 4: Validate all assets
    validate_assets
    
    # Step 5: Check for existing release
    check_existing_release
    
    # Step 6: Create the release
    create_release
    
    # Step 7: Verify the release
    verify_release
    
    echo ""
    echo "=========================================="
    log_info "Release $TAG completed successfully!"
    echo "=========================================="
}

main "$@"
