import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

// ============================================================================
// CONSTANTS
// ============================================================================

const BLUETOOTH_CONFIG = {
    TIME_SERVICE: 'ebe0ccb0-7a0a-4b0c-8a1a-6ff2997da3a6',
    TIME_CHARACTERISTIC: 'ebe0ccb7-7a0a-4b0c-8a1a-6ff2997da3a6',
    UNIT_CHARACTERISTIC: 'ebe0ccbe-7a0a-4b0c-8a1a-6ff2997da3a6',
};

const MAX_CONSOLE_MESSAGES = 20;

// ============================================================================
// TYPES
// ============================================================================

type LogType = 'info' | 'success' | 'error' | 'warning';

interface ConsoleMessage {
    text: string;
    type: LogType;
    time: Date;
}

interface TimeZoneInfo {
    name: string;
    offset: string;
    numericOffset: number;
    displayName: string;
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function XiaomiClockSync() {
    const [currentStep, setCurrentStep] = useState(1);
    const [deviceConnected, setDeviceConnected] = useState(false);
    const [, setConnectedDevice] = useState<BluetoothDevice | null>(null);
    const [connectedServer, setConnectedServer] = useState<BluetoothRemoteGATTServer | null>(null);
    const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);
    const [selectedTimezone, setSelectedTimezone] = useState<string>(() => {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
            return '';
        }
    });
    const [detectedTimezone] = useState<string>(() => {
        try {
            const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: userTimeZone,
                timeZoneName: 'shortOffset',
            });
            const parts = formatter.formatToParts(new Date());
            const offsetPart = parts.find((part) => part.type === 'timeZoneName');
            const offset = offsetPart ? offsetPart.value : 'UTC';
            return `${offset.replace('GMT', 'UTC')} (${userTimeZone})`;
        } catch {
            return 'Auto-detection failed';
        }
    });
    const [selectedUnit, setSelectedUnit] = useState('0');

    // Logging function
    const log = (message: string, type: LogType = 'info') => {
        console.log(message);
        setConsoleMessages((prev) => {
            const newMessages: ConsoleMessage[] = [
                ...prev,
                {
                    text: message,
                    type: type,
                    time: new Date(),
                },
            ];
            return newMessages.slice(-MAX_CONSOLE_MESSAGES);
        });
    };

    // Bluetooth connection
    const connectDevice = async () => {
        if (!navigator.bluetooth) {
            log('✗ Bluetooth API not supported in this browser', 'error');
            return;
        }

        try {
            log('Initiating Bluetooth connection...', 'info');

            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [BLUETOOTH_CONFIG.TIME_SERVICE],
            });

            log('Device selected, connecting...', 'info');
            setConnectedDevice(device);

            if (!device.gatt) {
                throw new Error('Device does not support GATT');
            }

            const server = await device.gatt.connect();
            setConnectedServer(server);
            setDeviceConnected(true);

            log('✓ Device connected successfully!', 'success');

            setCurrentStep(2);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log(`✗ Connection failed: ${msg}`, 'error');
            setDeviceConnected(false);
        }
    };

    // Get characteristic helper
    const getCharacteristic = async (serviceUuid: string, characteristicUuid: string): Promise<BluetoothRemoteGATTCharacteristic> => {
        if (!connectedServer) {
            throw new Error('No active connection');
        }

        log('Getting service...', 'info');
        const service = await connectedServer.getPrimaryService(serviceUuid);

        log('Getting characteristic...', 'info');
        return await service.getCharacteristic(characteristicUuid);
    };

    // Time synchronization
    const getCurrentTimeBuffer = (): ArrayBuffer => {
        const timeZoneName = selectedTimezone;

        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timeZoneName,
            timeZoneName: 'shortOffset',
        });

        const parts = formatter.formatToParts(now);
        const offsetPart = parts.find((part) => part.type === 'timeZoneName');
        const offsetString = offsetPart ? offsetPart.value : 'GMT';

        let offsetSeconds = 0;
        if (offsetString !== 'GMT') {
            const match = offsetString.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
            if (match) {
                const sign = match[1] === '+' ? 1 : -1;
                const hours = parseInt(match[2], 10);
                const minutes = match[3] ? parseInt(match[3], 10) : 0;
                offsetSeconds = sign * (hours * 3600 + minutes * 60);
            }
        }

        const timestamp = Math.floor(Date.now() / 1000) + offsetSeconds;

        const buffer = new ArrayBuffer(5);
        const view = new DataView(buffer);

        view.setUint32(0, timestamp, true);

        const timezoneHours = Math.round(offsetSeconds / 3600);
        view.setUint8(4, timezoneHours);

        return buffer;
    };

    const updateTime = async () => {
        if (!deviceConnected) {
            log('✗ Please connect to device first', 'error');
            return;
        }

        try {
            const characteristic = await getCharacteristic(BLUETOOTH_CONFIG.TIME_SERVICE, BLUETOOTH_CONFIG.TIME_CHARACTERISTIC);

            log('Writing time value...', 'info');
            await characteristic.writeValue(getCurrentTimeBuffer());

            log('✓ Time synchronized successfully!', 'success');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log(`✗ Error: ${msg}`, 'error');
        }
    };

    // Unit update
    const getUnitName = (value: string): string => (value === '0' ? 'Celsius' : 'Fahrenheit');

    const createUnitBuffer = (unitValue: number): ArrayBuffer => {
        const buffer = new ArrayBuffer(1);
        new DataView(buffer).setUint8(0, unitValue);
        return buffer;
    };

    const updateUnit = async () => {
        if (!deviceConnected) {
            log('✗ Please connect to device first', 'error');
            return;
        }

        try {
            const unitValue = parseInt(selectedUnit, 10);
            const unitName = getUnitName(selectedUnit);

            const characteristic = await getCharacteristic(BLUETOOTH_CONFIG.TIME_SERVICE, BLUETOOTH_CONFIG.UNIT_CHARACTERISTIC);

            const currentValue = await characteristic.readValue();
            const oldValue = currentValue.getUint8(0);
            const oldName = getUnitName(String(oldValue));

            log(`Updating unit (${oldName} → ${unitName})...`, 'info');

            await characteristic.writeValue(createUnitBuffer(unitValue));

            log('✓ Unit updated successfully!', 'success');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            log(`✗ Error: ${msg}`, 'error');
        }
    };

    // Navigation
    const resetToStart = () => {
        setCurrentStep(1);
        setDeviceConnected(false);
        setConnectedDevice(null);
        setConnectedServer(null);
        log('Disconnected - Ready to start over', 'info');
    };

    return (
        <div className="xiaomi-clock-sync">
            <div className="container">
                <Header connected={deviceConnected} />

                <StepIndicator currentStep={currentStep} />

                {currentStep === 1 && <ConnectStep onConnect={connectDevice} />}

                {currentStep === 2 && (
                    <ActionStep
                        onSelectTime={() => setCurrentStep(3)}
                        onSelectUnit={() => setCurrentStep(4)}
                        onBack={resetToStart}
                    />
                )}

                {currentStep === 3 && (
                    <TimeStep
                        selectedTimezone={selectedTimezone}
                        onTimezoneChange={setSelectedTimezone}
                        detectedTimezone={detectedTimezone}
                        onSync={updateTime}
                        onBack={() => setCurrentStep(2)}
                    />
                )}

                {currentStep === 4 && (
                    <UnitStep
                        selectedUnit={selectedUnit}
                        onUnitChange={setSelectedUnit}
                        onUpdate={updateUnit}
                        onBack={() => setCurrentStep(2)}
                    />
                )}

                <Console messages={consoleMessages} />
            </div>
        </div>
    );
}

// ============================================================================
// COMPONENTS
// ============================================================================

function XiaomiClockCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const tempRef = useRef(21.5);
    const humRef = useRef(45);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = 280,
            H = 155;
        // Screen sits flush-ish inside the white bezel
        const SX = 10,
            SY = 8,
            SW = 260,
            SH = 139;

        function rr(x: number, y: number, w: number, h: number, r: number) {
            ctx!.beginPath();
            ctx!.moveTo(x + r, y);
            ctx!.lineTo(x + w - r, y);
            ctx!.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx!.lineTo(x + w, y + h - r);
            ctx!.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx!.lineTo(x + r, y + h);
            ctx!.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx!.lineTo(x, y + r);
            ctx!.quadraticCurveTo(x, y, x + r, y);
            ctx!.closePath();
        }

        // segments: a(top) b(top-right) c(bot-right) d(bot) e(bot-left) f(top-left) g(mid)
        const SEG: Record<string, boolean[]> = {
            '0': [true, true, true, true, true, true, false],
            '1': [false, true, true, false, false, false, false],
            '2': [true, true, false, true, true, false, true],
            '3': [true, true, true, true, false, false, true],
            '4': [false, true, true, false, false, true, true],
            '5': [true, false, true, true, false, true, true],
            '6': [true, false, true, true, true, true, true],
            '7': [true, true, true, false, false, false, false],
            '8': [true, true, true, true, true, true, true],
            '9': [true, true, true, true, false, true, true],
            '-': [false, false, false, false, false, false, true],
        };

        function poly(pts: [number, number][], color: string) {
            if (pts.length < 3) return;
            ctx!.fillStyle = color;
            ctx!.beginPath();
            ctx!.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx!.lineTo(pts[i][0], pts[i][1]);
            ctx!.closePath();
            ctx!.fill();
        }

        // Horizontal tapered bar: center-left (lx,ly), length L, half-thickness h
        function hBar(lx: number, ly: number, L: number, h: number, color: string) {
            if (L <= 0) return;
            poly(
                [
                    [lx, ly],
                    [lx + h, ly - h],
                    [lx + L - h, ly - h],
                    [lx + L, ly],
                    [lx + L - h, ly + h],
                    [lx + h, ly + h],
                ],
                color,
            );
        }

        // Vertical tapered bar: top-center (vx,vy), length L, half-thickness h
        function vBar(vx: number, vy: number, L: number, h: number, color: string) {
            if (L <= 0) return;
            poly(
                [
                    [vx, vy],
                    [vx + h, vy + h],
                    [vx + h, vy + L - h],
                    [vx, vy + L],
                    [vx - h, vy + L - h],
                    [vx - h, vy + h],
                ],
                color,
            );
        }

        function drawDigit(x: number, y: number, dw: number, dh: number, ch: string, on: string, off: string) {
            const segs = SEG[ch] ?? new Array(7).fill(false);
            const t = Math.max(2, Math.round(dw / 6));
            const h = t / 2;
            const g = Math.max(2, Math.round(t * 0.5)); // wide gap → chamfers always clear
            const hw = Math.round(dh / 2);
            const L_horiz = dw - 2 * t - 2 * g;
            const L_vert = hw - t - 2 * g;
            const c = (i: number) => (segs[i] ? on : off);

            hBar(x + t + g, y + h, L_horiz, h, c(0)); // a top
            vBar(x + dw - h, y + t + g, L_vert, h, c(1)); // b top-right
            vBar(x + dw - h, y + hw + g, L_vert, h, c(2)); // c bot-right
            hBar(x + t + g, y + dh - h, L_horiz, h, c(3)); // d bot
            vBar(x + h, y + hw + g, L_vert, h, c(4)); // e bot-left
            vBar(x + h, y + t + g, L_vert, h, c(5)); // f top-left
            hBar(x + t + g, y + hw, L_horiz, h, c(6)); // g mid
        }

        function drawStr(str: string, x: number, y: number, dw: number, dh: number, on: string, off: string) {
            let cx = x;
            const gap = Math.max(2, Math.round(dw * 0.15));
            const dotSz = Math.max(2, Math.round(dw * 0.18));
            const colW = Math.max(3, Math.round(dw * 0.22));
            for (const ch of str) {
                if (ch === ':') {
                    ctx!.fillStyle = on;
                    ctx!.fillRect(cx, y + Math.round(dh * 0.22), dotSz, dotSz);
                    ctx!.fillRect(cx, y + Math.round(dh * 0.63), dotSz, dotSz);
                    cx += colW + gap;
                } else if (ch === '.') {
                    ctx!.fillStyle = on;
                    ctx!.fillRect(cx, y + dh - dotSz, dotSz, dotSz);
                    cx += dotSz + gap;
                } else {
                    drawDigit(cx, y, dw, dh, ch, on, off);
                    cx += dw + gap;
                }
            }
            return cx;
        }

        // Monochrome LCD palette — dark segments on pale gray (matches real device photo)
        const ON = '#2c2e2b';
        const OFF = 'rgba(44,46,43,0.07)';

        const draw = () => {
            const now = new Date();
            ctx.clearRect(0, 0, W, H);

            // White plastic body
            const bg = ctx.createLinearGradient(0, 0, 0, H);
            bg.addColorStop(0, '#ffffff');
            bg.addColorStop(0.6, '#f4f4f4');
            bg.addColorStop(1, '#e0e0e0');
            ctx.fillStyle = bg;
            rr(0, 0, W, H, 12);
            ctx.fill();
            ctx.strokeStyle = '#c8c8c8';
            ctx.lineWidth = 1;
            rr(0.5, 0.5, W - 1, H - 1, 12);
            ctx.stroke();
            // subtle top sheen
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(12, 1.5);
            ctx.lineTo(W - 12, 1.5);
            ctx.stroke();

            // Pale gray LCD panel
            ctx.fillStyle = '#cdd1ca';
            rr(SX, SY, SW, SH, 6);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.10)';
            ctx.lineWidth = 1;
            rr(SX + 0.5, SY + 0.5, SW - 1, SH - 1, 6);
            ctx.stroke();

            // ── Large HH:MM  (top ~63% of screen) ──────────────────────────
            const hr = now.getHours(),
                mn = now.getMinutes();
            const timeStr = `${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
            const DW = 46,
                DH = 78;
            const gap4 = Math.max(2, Math.round(DW * 0.15));
            const dot4 = Math.max(2, Math.round(DW * 0.18));
            const col4 = Math.max(3, Math.round(DW * 0.22));
            // visual width of "HH:MM"
            const tW = (DW + gap4) * 4 + col4 + dot4 + gap4;
            const timeX = SX + Math.round((SW - tW) / 2);
            const timeY = SY + Math.round((SH * 0.63 - DH) / 2) + 2;
            drawStr(timeStr, timeX, timeY, DW, DH, ON, OFF);

            // ── Bottom row: humidity | temperature | face ────────────────────
            const tdw = 14,
                tdh = 26;
            const rowY = SY + SH - tdh - 8;

            // Drift temp/hum slowly
            tempRef.current = Math.min(27, Math.max(18, tempRef.current + (Math.random() - 0.5) * 0.2));
            humRef.current = Math.min(65, Math.max(30, humRef.current + (Math.random() - 0.5) * 0.6));

            const tempVal = tempRef.current.toFixed(1); // "21.5"
            const humVal = Math.round(humRef.current).toString(); // "45"
            const comfortable = humRef.current >= 40 && humRef.current <= 60 && tempRef.current >= 20 && tempRef.current <= 26;
            const face = comfortable ? '(^_^)' : '(-_-)';

            // Humidity left
            const humEnd = drawStr(humVal, SX + 10, rowY, tdw, tdh, ON, OFF);
            ctx.fillStyle = ON;
            ctx.font = `bold ${tdh * 0.45}px Arial,sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText('%', humEnd, rowY + tdh - 1);

            // Temperature center
            const tempX = SX + Math.round(SW * 0.38);
            const tempEnd = drawStr(tempVal, tempX, rowY, tdw, tdh, ON, OFF);
            ctx.fillStyle = ON;
            ctx.font = `bold ${tdh * 0.45}px Arial,sans-serif`;
            // degree symbol
            ctx.font = `${tdh * 0.38}px Arial,sans-serif`;
            ctx.fillText('°C', tempEnd + 1, rowY + Math.round(tdh * 0.55));

            // Comfort face right — rendered as small text glyphs
            ctx.fillStyle = ON;
            ctx.font = `bold ${tdh * 0.52}px "Courier New",monospace`;
            ctx.textAlign = 'right';
            ctx.fillText(face, SX + SW - 8, rowY + tdh - 2);
            ctx.textAlign = 'left';
        };

        draw();
        const id = setInterval(draw, 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <canvas
            ref={canvasRef}
            width={280}
            height={155}
            className="device-image"
            style={{ height: '155px' }}
            title="Live LYWSD02 clock"
        />
    );
}

interface HeaderProps {
    connected: boolean;
}

function Header({ connected }: HeaderProps) {
    return (
        <div className="header">
            <h1>Xiaomi LYWSD02 Clock Sync</h1>
            <h2>
                Xiaomi Mijia BT4.0 Wireless Smart Electric Digital Clock
                <br />
                Indoor & Outdoor Hygrometer Thermometer
            </h2>
            <XiaomiClockCanvas />
            <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                <span>●</span> {connected ? 'Device Connected' : 'Not Connected'}
            </div>
        </div>
    );
}

interface StepIndicatorProps {
    currentStep: number;
}

function StepIndicator({ currentStep }: StepIndicatorProps) {
    const progressPercentages: Record<number, string> = { 1: '0%', 2: '50%', 3: '100%', 4: '100%' };

    return (
        <div className="step-indicator">
            <div
                className="step-indicator-progress"
                style={{ width: progressPercentages[currentStep] ?? '0%' }}
            />
            {[1, 2, 3].map((step) => (
                <div
                    key={step}
                    className={`step ${step < currentStep ? 'completed' : ''} ${step === currentStep ? 'active' : ''}`}>
                    <div className="step-circle">{step}</div>
                    <div className="step-label">{step === 1 ? 'Connect Device' : step === 2 ? 'Choose Action' : 'Complete'}</div>
                </div>
            ))}
        </div>
    );
}

interface ConnectStepProps {
    onConnect: () => void;
}

function ConnectStep({ onConnect }: ConnectStepProps) {
    return (
        <div className="card active">
            <div className="card-title">Step 1: Connect to Device</div>
            <div className="card-description">
                Click the button below to scan for nearby Bluetooth devices. Select your LYWSD02 clock from the list to establish a
                connection.
            </div>
            <button onClick={onConnect}>Connect via Bluetooth</button>
        </div>
    );
}

interface ActionStepProps {
    onSelectTime: () => void;
    onSelectUnit: () => void;
    onBack: () => void;
}

function ActionStep({ onSelectTime, onSelectUnit, onBack }: ActionStepProps) {
    return (
        <div className="card active">
            <div className="card-title">Step 2: Choose Action</div>
            <div className="card-description">What would you like to do with your connected device?</div>

            <div className="action-grid">
                <button
                    className="action-button"
                    onClick={onSelectTime}>
                    <div className="action-icon">🕐</div>
                    <div className="action-label">Sync Time</div>
                    <div className="action-desc">Update device time and timezone</div>
                </button>

                <button
                    className="action-button"
                    onClick={onSelectUnit}>
                    <div className="action-icon">🌡️</div>
                    <div className="action-label">Update Unit</div>
                    <div className="action-desc">Switch between °C and °F</div>
                </button>
            </div>

            <div className="button-group">
                <button
                    className="button-secondary"
                    onClick={onBack}>
                    ← Disconnect
                </button>
            </div>
        </div>
    );
}

interface TimeStepProps {
    selectedTimezone: string;
    onTimezoneChange: (value: string) => void;
    detectedTimezone: string;
    onSync: () => void;
    onBack: () => void;
}

function TimeStep({ selectedTimezone, onTimezoneChange, detectedTimezone, onSync, onBack }: TimeStepProps) {
    const timezones = useMemo<TimeZoneInfo[]>(() => {
        const now = new Date();
        const timeZoneData = Intl.supportedValuesOf('timeZone').map((tz) => {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                timeZoneName: 'shortOffset',
            });

            const parts = formatter.formatToParts(now);
            const offsetPart = parts.find((part) => part.type === 'timeZoneName');
            const offset = offsetPart ? offsetPart.value : 'UTC';

            let numericOffset = 0;
            if (offset !== 'UTC') {
                const match = offset.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
                if (match) {
                    const sign = match[1] === '+' ? 1 : -1;
                    const hours = parseInt(match[2], 10);
                    const minutes = match[3] ? parseInt(match[3], 10) : 0;
                    numericOffset = sign * (hours * 60 + minutes);
                }
            }

            return {
                name: tz,
                offset,
                numericOffset,
                displayName: `${offset.replace('GMT', 'UTC')} - ${tz.replace(/_/g, ' ')}`,
            };
        });

        return timeZoneData.sort((a, b) => {
            if (a.numericOffset !== b.numericOffset) return a.numericOffset - b.numericOffset;
            return a.name.localeCompare(b.name);
        });
    }, []);

    return (
        <div className="card active">
            <div className="card-title">Synchronize Time</div>

            <div className="form-group">
                <label htmlFor="timezone">Time Zone</label>
                <select
                    id="timezone"
                    value={selectedTimezone}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => onTimezoneChange(e.target.value)}>
                    {timezones.map((tz) => (
                        <option
                            key={tz.name}
                            value={tz.name}>
                            {tz.displayName}
                        </option>
                    ))}
                </select>
                <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                    Auto-detected: <span style={{ color: 'var(--primary)', fontWeight: 500 }}>{detectedTimezone}</span>
                </small>
            </div>

            <div className="button-group">
                <button
                    className="button-secondary"
                    onClick={onBack}>
                    ← Back
                </button>
                <button onClick={onSync}>Sync Time Now</button>
            </div>
        </div>
    );
}

interface UnitStepProps {
    selectedUnit: string;
    onUnitChange: (value: string) => void;
    onUpdate: () => void;
    onBack: () => void;
}

function UnitStep({ selectedUnit, onUnitChange, onUpdate, onBack }: UnitStepProps) {
    return (
        <div className="card active">
            <div className="card-title">Update Temperature Unit</div>

            <div className="radio-group">
                <div className="radio-option">
                    <input
                        type="radio"
                        id="celsius"
                        name="unit"
                        value="0"
                        checked={selectedUnit === '0'}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => onUnitChange(e.target.value)}
                    />
                    <label
                        htmlFor="celsius"
                        className="radio-label">
                        °C
                    </label>
                </div>
                <div className="radio-option">
                    <input
                        type="radio"
                        id="fahrenheit"
                        name="unit"
                        value="1"
                        checked={selectedUnit === '1'}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => onUnitChange(e.target.value)}
                    />
                    <label
                        htmlFor="fahrenheit"
                        className="radio-label">
                        °F
                    </label>
                </div>
            </div>

            <div className="button-group">
                <button
                    className="button-secondary"
                    onClick={onBack}>
                    ← Back
                </button>
                <button onClick={onUpdate}>Update Unit</button>
            </div>
        </div>
    );
}

interface ConsoleProps {
    messages: ConsoleMessage[];
}

function Console({ messages }: ConsoleProps) {
    const consoleRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div className="console-card">
            <div className="card-title">Activity Log</div>
            <div
                className="console"
                ref={consoleRef}>
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={`console-message ${msg.type}`}>
                        [{msg.time.toLocaleTimeString()}] {msg.text}
                    </div>
                ))}
            </div>
        </div>
    );
}
