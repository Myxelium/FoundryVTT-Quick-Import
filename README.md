![GitHub Downloads (specific asset, all releases)](https://img.shields.io/github/downloads/Myxelium/FoundryVTT-Quick-Import/quick-battlemap-importer.zip)


## Myxelium's Battlemap Importer

Effortlessly turn single images or exported map data into ready‑to‑play Foundry VTT scenes. Drop an image or video for the background, optionally drop a JSON export with walls and lights, and create a complete scene in seconds.

### What it is

Quick Battlemap Importer is a Foundry VTT module that adds a simple "Quick import" button to the Scenes sidebar. It opens a window where you can drag and drop a background image or video and, if you have it, a JSON configuration file. The module uploads the media, applies grid settings, creates walls, lights and doors etc, and builds a new scene for you automatically.

### Why it exists

Setting up scenes manually can be slow: uploading backgrounds, measuring grid size, placing walls, and configuring lights. This module removes repetitive steps so you can spend more time playing and less time navigating configuration windows.


### Inside foundry
<img width="629" height="497" alt="image" src="https://github.com/user-attachments/assets/a848543f-7a96-439a-8897-4971cf8a4cb5" />
<img width="538" height="422" alt="image" src="https://github.com/user-attachments/assets/d7672c2e-d241-4ced-8f6f-b5479e522287" />



### The problem it solves

- Converts a plain map image into a playable scene with minimal effort
- It attempts to apply grid settings automatically from submitted image
- Imports walls and lights from common JSON exports (ex, Dungeon Alchemist)
- Saves time for game masters managing many scenes

## Key features

- Drag-and-drop panel for images, videos, and JSON configuration files
- Automatic grid detection for images when no JSON is provided
- Imports walls and ambient lights from supported JSON
- Creates and activates a new scene with the uploaded background
- Optional "No grid" toggle for gridless maps
- GM-only quick access button in the Scenes directory

## Compatibility

- Foundry VTT compatibility: minimum 10, verified 12

## Installation

1. Open Foundry VTT and go to the "Add-on Modules" tab
2. Click "Install Module"
3. Paste this Manifest URL:
  https://github.com/Myxelium/QuickFoundryVTT-Quick-Import/releases/latest/download/module.json
4. Click "Install"

Manual download (optional):

- Download ZIP: https://github.com/Myxelium/QuickFoundryVTT-Quick-Import/releases/latest/download/quick-battlemap-importer.zip

## Usage

1. Enable the module in your world
2. Open the Scenes sidebar
3. Click the "Quick import" button (GM only)
4. In the panel, drag and drop one of the following:
  - Background image (png, jpg, jpeg) or video (webm, mp4)
  - Optional JSON export with walls and lights (for example, from tools like Dungeon Alchemist or compatible Foundry exports)
5. Optionally enable "No grid" if the map is gridless
6. Click "Create Scene"

The module uploads the media to your world, applies grid settings (auto-detected if no JSON was supplied), and creates walls and lights when present.

## Supported inputs

- Media: PNG, JPG/JPEG, WEBM, MP4
- JSON configuration: walls and ambient lights in common Foundry-compatible formats; many Dungeon Alchemist exports should work out of the box

## Notes and limitations

- Grid auto-detection runs for images when no JSON is provided and may not succeed on all artwork
- Auto-detection is intentionally skipped for videos
- You can always create a scene with only a background; adjust grid later if needed

## Credits

- Author: Myxelium (https://github.com/Myxelium)

## License

MIT
