# Easy Battlemap for Foundry VTT

This module allows you to quickly create battlemaps in Foundry VTT by simply dragging and dropping a background image and a JSON file containing wall data.

## Installation

1. In the Foundry VTT setup screen, go to "Add-on Modules" tab
2. Click "Install Module"
3. Paste the following URL in the "Manifest URL" field: 
   `https://github.com/MyxeliumI/easy-battlemap/releases/latest/download/module.json`
4. Click "Install"

## Usage

1. Enable the module in your game world
2. Navigate to the "Scenes" tab
3. You'll see a new "Easy Battlemap Creator" panel
4. Drag and drop your background image/video (jpg, png, webm, mp4) 
5. Drag and drop your JSON file with wall data
6. Once both files are loaded, click "Create Battlemap Scene"

## JSON Format

The JSON file should contain wall data in the following format:

```json
{
  "walls": [
    {
      "c": [x1, y1, x2, y2],
      "door": 0,
      "move": 0,
      "sense": 0,
      "dir": 0,
      "ds": 0,
      "flags": {}
    },
    // ... more walls
  ],
  "lights": [
    // optional light data
  ],
  "notes": [
    // optional note data
  ],
  "tokens": [
    // optional token data
  ],
  "drawings": [
    // optional drawing data
  ]
}
```

For the specific format details, refer to the [Foundry VTT REST API Relay documentation](https://github.com/ThreeHats/foundryvtt-rest-api-relay/wiki/create-POST#request-payload).

## License

This module is licensed under the MIT License.