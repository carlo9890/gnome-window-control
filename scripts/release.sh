#!/usr/bin/env bash
#
# release.sh - Create a GitHub release from extension version
#
# Usage: ./scripts/release.sh [--dry-run]
#
# Prerequisites:
#   - gh CLI installed and authenticated
#   - gh CLI needs 'workflow' scope: gh auth refresh -h github.com -s workflow
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}DRY RUN MODE - no changes will be made${NC}"
fi

# Check prerequisites
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: gh CLI is not installed${NC}"
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: gh CLI is not authenticated${NC}"
    echo "Run: gh auth login"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is not installed${NC}"
    exit 1
fi

# Get version from extension metadata
METADATA_FILE="$PROJECT_ROOT/window-control@hko9890/metadata.json"
if [[ ! -f "$METADATA_FILE" ]]; then
    echo -e "${RED}Error: metadata.json not found at $METADATA_FILE${NC}"
    exit 1
fi

VERSION=$(jq -r '.version' "$METADATA_FILE")
TAG="v${VERSION}"

echo "Extension version: $VERSION"
echo "Git tag: $TAG"

# Check if tag already exists
if git rev-parse "$TAG" &> /dev/null; then
    echo -e "${YELLOW}Tag $TAG already exists${NC}"
    
    # Check if release exists
    if gh release view "$TAG" &> /dev/null; then
        echo -e "${YELLOW}Release $TAG already exists on GitHub${NC}"
        echo "To re-release, first delete it: gh release delete $TAG"
        exit 0
    fi
else
    echo "Creating tag $TAG..."
    if [[ "$DRY_RUN" == "false" ]]; then
        git tag -a "$TAG" -m "Release $TAG"
        git push origin "$TAG"
        echo -e "${GREEN}Tag $TAG created and pushed${NC}"
    else
        echo "[DRY RUN] Would create and push tag $TAG"
    fi
fi

# Generate release notes
RELEASE_NOTES=$(cat << NOTES
## What's New in v${VERSION}

### Installation

\`\`\`bash
# Install extension
gnome-extensions install window-control@hko9890 --force
gnome-extensions enable window-control@hko9890

# Install wctl CLI
./install-wctl.sh
\`\`\`

### Compatibility
- GNOME Shell 45, 46, 47
- Wayland and X11

### Downloads
- **window-control-extension.zip** - GNOME Shell extension
- **wctl** - CLI wrapper script
- **install-wctl.sh** - Installation script for wctl

See [README.md](https://github.com/carlo9890/gnome-window-control/blob/main/README.md) for full documentation.
NOTES
)

echo ""
echo "Creating release $TAG..."

if [[ "$DRY_RUN" == "false" ]]; then
    # Build the extension first
    echo "Building extension..."
    "$PROJECT_ROOT/scripts/build.sh" all
    
    # Find the built zip
    ZIP_FILE=$(ls -t "$PROJECT_ROOT/dist/"*.zip 2>/dev/null | head -1)
    if [[ -z "$ZIP_FILE" ]]; then
        echo -e "${RED}Error: No zip file found in dist/${NC}"
        exit 1
    fi
    
    # Create release with assets
    gh release create "$TAG" \
        --title "v${VERSION}" \
        --notes "$RELEASE_NOTES" \
        "$ZIP_FILE" \
        "$PROJECT_ROOT/wctl" \
        "$PROJECT_ROOT/install-wctl.sh"
    
    echo -e "${GREEN}Release $TAG created successfully!${NC}"
    echo ""
    echo "View at: $(gh release view "$TAG" --json url -q '.url')"
else
    echo "[DRY RUN] Would create release with:"
    echo "  Title: v${VERSION}"
    echo "  Tag: $TAG"
    echo "  Assets: dist/*.zip, wctl, install-wctl.sh"
    echo ""
    echo "Release notes:"
    echo "$RELEASE_NOTES"
fi
