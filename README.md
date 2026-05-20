# xiaomi-LYWSD02-sync

A browser-based tool to synchronize the clock and configure the temperature unit of the **Xiaomi Mijia LYWSD02** (BT 4.0 Wireless Smart Electric Digital Clock / Indoor & Outdoor Hygrometer Thermometer) via the Web Bluetooth API — no app or installation required.

---

## Features

- **Synchronize Time** — pushes the current time and your timezone offset directly to the device clock. An optional 30-minute offset is available for half-hour timezones.
- **Update Temperature Unit** — switch the display between °C (Celsius) and °F (Fahrenheit).
- **Activity Log** — an in-page console shows timestamped status messages for every operation.

---

## Requirements

| Requirement | Detail |
|---|---|
| Browser | Google Chrome / Microsoft Edge (or any Chromium-based browser) — Web Bluetooth API is **not** supported in Firefox or Safari |
| Bluetooth | The host device must have Bluetooth enabled |
| Device | Xiaomi LYWSD02 clock nearby and powered on |

---

## Usage

Open `index.html` in a supported browser (or visit the hosted page). The wizard walks you through three steps:

1. **Connect Device** — click **Connect via Bluetooth**. A browser picker lists nearby Bluetooth devices; select your LYWSD02.
2. **Choose Action** — after a successful connection choose one of:
   - 🕐 **Synchronize Time** — the timezone offset is pre-filled from your browser locale. Adjust it if needed (range −12 to +14) and tick *Add 30 minute offset* for half-hour zones, then click **Sync Time Now**.
   - 🌡️ **Update Temperature Unit** — select °C or °F and click **Update Unit**.
3. **Done** — the Activity Log confirms success or reports any error.

Click **Disconnect & Start Over** at any time to return to Step 1.

---

## Technical Details

The app communicates over BLE using the following service and characteristics:

| Name | UUID |
|---|---|
| Time Service | `ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6` |
| Time Characteristic | `ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6` |
| Unit Characteristic | `ebe0ccbe-7a0a-4b0c-8a1a-6ff2997da3a6` |

### Time write payload (5 bytes, little-endian)

| Bytes | Type | Description |
|---|---|---|
| 0–3 | `uint32` LE | Unix timestamp (seconds since epoch), with optional +1800 s offset |
| 4 | `uint8` | Timezone offset in whole hours (e.g. `5` for UTC+5) |

### Unit write payload (1 byte)

| Value | Meaning |
|---|---|
| `0x00` | Celsius |
| `0x01` | Fahrenheit |
