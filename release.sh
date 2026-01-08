#!/bin/bash

# Release script for Quick Battlemap Importer
# Increments version in module.json and creates a release zip

set -e

MODULE_FILE="module.json"
ZIP_NAME="quick-battlemap-importer.zip"

# Check if module.json exists
if [ ! -f "$MODULE_FILE" ]; then
    echo "Error: $MODULE_FILE not found!"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(grep -oP '"version":\s*"\K[0-9]+\.[0-9]+\.[0-9]+' "$MODULE_FILE")

if [ -z "$CURRENT_VERSION" ]; then
    echo "Error: Could not find version in $MODULE_FILE"
    exit 1
fi

echo "Current version: $CURRENT_VERSION"

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Increment patch version by default
# Use arguments to control which part to increment:
# -M or --major: increment major version
# -m or --minor: increment minor version
# -p or --patch: increment patch version (default)

INCREMENT_TYPE="patch"

while [[ $# -gt 0 ]]; do
    case $1 in
        -M|--major)
            INCREMENT_TYPE="major"
            shift
            ;;
        -m|--minor)
            INCREMENT_TYPE="minor"
            shift
            ;;
        -p|--patch)
            INCREMENT_TYPE="patch"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [-M|--major] [-m|--minor] [-p|--patch]"
            exit 1
            ;;
    esac
done

case $INCREMENT_TYPE in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW_VERSION"

# Update version in module.json
sed -i "s/\"version\":\s*\"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$MODULE_FILE"

# Also update manifest and download URLs if they contain the version
sed -i "s|/releases/download/$CURRENT_VERSION/|/releases/download/$NEW_VERSION/|g" "$MODULE_FILE"

echo "Updated $MODULE_FILE with version $NEW_VERSION"

# Remove old zip if it exists
if [ -f "$ZIP_NAME" ]; then
    rm "$ZIP_NAME"
    echo "Removed old $ZIP_NAME"
fi

# Create zip of all visible files (excluding hidden files/folders and the zip itself)
zip -r "$ZIP_NAME" . -x ".*" -x "*/.*" -x "$ZIP_NAME" -x "release.sh"

echo "Created $ZIP_NAME"
echo ""
echo "Release $NEW_VERSION complete!"
