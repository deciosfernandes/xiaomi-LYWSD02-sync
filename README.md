# Xiaomi LYWSD02 Clock Sync

Web app to sync time and temperature unit to a **Xiaomi Mijia LYWSD02** Bluetooth clock directly from the browser — no app, no drivers.

**Live app:** https://deciosfernandes.github.io/xiaomi-LYWSD02-sync/

## Features

- Connect to LYWSD02 via Web Bluetooth
- Sync current time with timezone selection (auto-detects your local timezone)
- Switch temperature unit between °C and °F
- Live canvas-rendered LCD display simulating the device
- Activity log showing every BT operation
- Deployed as a static site — no backend

## Browser Requirements

Web Bluetooth is required. Supported browsers:

| Browser | Supported |
|---------|-----------|
| Chrome / Chromium 56+ | ✓ |
| Edge 79+ | ✓ |
| Opera 43+ | ✓ |
| Firefox | ✗ |
| Safari | ✗ |

Must be served over **HTTPS** or **localhost**.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in a supported browser.

## Usage

1. **Connect** — click *Connect via Bluetooth*, select your LYWSD02 from the browser picker
2. **Choose action** — Sync Time or Update Unit
3. **Sync Time** — confirm or change timezone, click *Sync Time Now*
4. **Update Unit** — pick °C or °F, click *Update Unit*

## How It Works

Uses the **Web Bluetooth API** to write to GATT characteristics on the proprietary time service:

| Item | UUID |
|------|------|
| Service | `ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6` |
| Time characteristic | `ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6` |
| Unit characteristic | `ebe0ccbe-7a0a-4b0c-8a1a-6ff2997da3a6` |

**Time payload** — 5 bytes (little-endian):
- Bytes 0–3: Unix timestamp adjusted for selected timezone offset (uint32 LE)
- Byte 4: Timezone offset in hours (int8)

**Unit payload** — 1 byte: `0x00` = Celsius, `0x01` = Fahrenheit

## Build & Deploy

| Script | Command |
|--------|---------|
| Dev server | `npm run dev` |
| Type-check + build | `npm run build` |
| Preview build | `npm run preview` |
| Lint | `npm run lint` |

Pushes to `main` automatically deploy to **GitHub Pages** via `.github/workflows/deploy.yml`.

## Tech Stack

- [React 19](https://react.dev) + [React Compiler](https://react.dev/learn/react-compiler)
- [TypeScript 6](https://www.typescriptlang.org)
- [Vite 8](https://vite.dev)
- [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
