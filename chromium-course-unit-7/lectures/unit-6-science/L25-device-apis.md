# Lecture 25 — Device APIs for the Lab: WebUSB, Web Bluetooth, Web Serial, WebHID

| | |
|---|---|
| **Unit** | VI — The Web Platform for Science |
| **Week** | 13 |
| **Duration** | 1.5 hours |
| **Demo** | Live Web Serial read from an Arduino simulating a UV-Vis spectrometer; WebHID connection to a balance |

## Learning objectives

Students can:

1. Explain which hardware communication protocol to use for a given lab instrument.
2. Use the Web Serial API to open a port, configure baud rate and stop bits, and read lines.
3. Use the WebUSB API to enumerate devices and perform control/bulk transfers.
4. Use the Web Bluetooth API to scan for BLE devices and read a characteristic.
5. Describe the permissions model for device APIs — what the browser asks the user.
6. Identify when a browser-based instrument interface is the right tool vs. a native app.

## Opening hook (5 min)

Ask the chemistry students: *"What software do you use to collect data from lab instruments?"*

Common answers: LabVIEW, vendor-specific desktop apps (MestReNova for NMR, Origin, etc.), MATLAB + Data Acquisition Toolbox, ancient serial-port programs written in Visual Basic 6 that still run on a Windows XP machine in the corner.

Then: *"What if you could point a Chrome tab at your NMR spectrometer, program the measurement in JavaScript, display the spectrum in a WebGPU-rendered plot, save to IndexedDB, and share the link with your collaborator who opens it in their browser and sees the live stream?"*

This is not science fiction. The hardware APIs exist. The security model is reasonable. The remaining work is integration — and that's the lab engineering problem this lecture teaches you to solve.

## Which API for which instrument? (10 min)

Four device APIs, each for a different physical connection type. Draw this table:

| API | Physical interface | Typical lab instruments | Abstraction level |
|---|---|---|---|
| **Web Serial** | RS-232 serial port, USB-to-serial adapters | pH meters, balances, simple spectrometers, Arduino, Raspberry Pi Pico, temperature loggers | Byte streams; you handle framing |
| **WebUSB** | USB directly (vendor-defined interface) | Custom USB instruments, oscilloscopes, some NIDAQs, power supplies | Raw USB control/bulk/interrupt transfers |
| **Web Bluetooth** | Bluetooth Low Energy (BLE) | Wireless sensors, portable spectrometers, some wearable biometrics | GATT services and characteristics |
| **WebHID** | HID (Human Interface Device) over USB | Lab balances that enumerate as HID, some joystick-style controllers for microscopes | Typed HID reports |

Which to use: *"Follow the cable."* RS-232 port or USB-serial adapter → Web Serial. Bare USB with vendor ID → WebUSB. BLE GATT profile → Web Bluetooth. HID descriptor → WebHID.

**All four require explicit user permission** — the browser shows a picker dialog. The webpage cannot silently enumerate all connected devices. This is the security model: origin-scoped, user-granted, revocable.

## Web Serial — reading an instrument stream (25 min)

Web Serial is the most broadly applicable. Almost every serial lab instrument (and every Arduino/Pi Pico sketch) can be read this way.

### Anatomy of a serial instrument message

Most serial instruments send ASCII lines terminated by `\r\n` (CRLF) or `\n`. A pH meter might send:

```
pH=6.234\r\n
pH=6.231\r\n
pH=6.229\r\n
```

A UV-Vis spectrometer might send wavelength-intensity pairs:

```
200,0.012\r\n
201,0.015\r\n
...
800,0.001\r\n
END\r\n
```

Your JavaScript needs to: (1) open the port, (2) configure baud rate, (3) stream bytes, (4) buffer them, (5) split on the delimiter, (6) parse each line.

### Full Web Serial implementation

```javascript
class InstrumentSerial {
    constructor() {
        this.port   = null;
        this.reader = null;
        this.buffer = '';
        this.lineHandlers = [];
    }

    // Step 1: Request port — triggers browser picker dialog
    async connect(baudRate = 9600, dataBits = 8, stopBits = 1, parity = 'none') {
        // Browser shows a native picker with all available serial ports
        this.port = await navigator.serial.requestPort();

        await this.port.open({ baudRate, dataBits, stopBits, parity });

        // Start reading
        this._startReading();
        console.log(`Serial port opened at ${baudRate} baud`);
    }

    async _startReading() {
        // ReadableStream of Uint8Array chunks
        this.reader = this.port.readable.getReader();

        try {
            while (true) {
                const { value, done } = await this.reader.read();
                if (done) break;

                // Decode bytes to string and accumulate
                this.buffer += new TextDecoder().decode(value);

                // Split on newline; dispatch complete lines
                const lines = this.buffer.split('\n');
                this.buffer = lines.pop();   // last fragment (incomplete)

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed) this._onLine(trimmed);
                }
            }
        } catch (err) {
            console.error('Serial read error:', err);
        } finally {
            this.reader.releaseLock();
        }
    }

    _onLine(line) {
        for (const handler of this.lineHandlers) handler(line);
    }

    onLine(fn) { this.lineHandlers.push(fn); return this; }

    // Step 2: Write to instrument (send commands)
    async send(command) {
        const writer = this.port.writable.getWriter();
        await writer.write(new TextEncoder().encode(command + '\r\n'));
        writer.releaseLock();
    }

    async disconnect() {
        await this.reader?.cancel();
        await this.port?.close();
    }
}

// ----- Usage: UV-Vis spectrometer -----

const spec = new InstrumentSerial();
const spectrum = {};

spec.onLine(line => {
    if (line === 'END') {
        plotSpectrum(spectrum);  // render the completed spectrum
        return;
    }
    const [wavelength, absorbance] = line.split(',').map(Number);
    if (!isNaN(wavelength) && !isNaN(absorbance)) {
        spectrum[wavelength] = absorbance;
    }
});

// Connect and send acquisition command
await spec.connect(19200);
await spec.send('SCAN 200 800');    // instrument-specific command
```

### Arduino demo setup

For the live demo, an Arduino Uno simulating a UV-Vis spectrometer (a simple transmitting loop):

```cpp
// arduino_uvvis_sim.ino
void setup() {
    Serial.begin(19200);
}

void loop() {
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();

        if (cmd.startsWith("SCAN")) {
            int start_wl = 200, end_wl = 800;
            sscanf(cmd.c_str(), "SCAN %d %d", &start_wl, &end_wl);

            for (int wl = start_wl; wl <= end_wl; wl++) {
                // Simulate Beer-Lambert: A = ε·c·l
                // Fake a protein absorbance peak at 280nm and peptide bond at 220nm
                float eps280 = exp(-0.5 * pow((wl - 280) / 5.0, 2)) * 1.2;
                float eps220 = exp(-0.5 * pow((wl - 220) / 8.0, 2)) * 2.5;
                float A = (eps280 + eps220) * 0.5;   // concentration * path = 0.5
                // Add noise
                A += (random(-100, 100) / 10000.0);

                Serial.print(wl);
                Serial.print(",");
                Serial.println(A, 4);
                delay(2);   // simulate scan time
            }
            Serial.println("END");
        }
    }
}
```

This outputs a fake UV-Vis spectrum of a protein solution (absorption peaks at 220 nm and 280 nm, consistent with peptide bonds and aromatic residues respectively). Students will recognize this from analytical chemistry.

## WebUSB — vendor-defined USB (15 min)

Web Serial works for serial-over-USB. For instruments that implement a **vendor-defined USB class** (not CDC/ACM serial), you need WebUSB to send raw USB control and bulk transfers.

### The USB protocol basics students need

USB devices expose:
- **Vendor ID (VID)** and **Product ID (PID)** — 16-bit identifiers.
- **Interfaces** — logical groupings of endpoints.
- **Endpoints** — unidirectional data pipes. Bulk IN (device → computer), Bulk OUT (computer → device), Control (bidirectional setup messages).
- **Configurations** — top-level device mode (most devices have one).

A WebUSB interaction:

```javascript
class InstrumentUSB {
    constructor(vendorId, productId, bulkInEndpoint = 0x81, bulkOutEndpoint = 0x01) {
        this.vendorId        = vendorId;
        this.productId       = productId;
        this.bulkInEndpoint  = bulkInEndpoint;
        this.bulkOutEndpoint = bulkOutEndpoint;
        this.device          = null;
    }

    async connect() {
        // Browser shows USB device picker filtered by vendorId
        this.device = await navigator.usb.requestDevice({
            filters: [{ vendorId: this.vendorId, productId: this.productId }]
        });

        await this.device.open();
        await this.device.selectConfiguration(1);     // select config 1
        await this.device.claimInterface(0);          // claim interface 0

        console.log(`USB connected: ${this.device.manufacturerName} ${this.device.productName}`);
    }

    // Control transfer: send a command to the device's control endpoint
    async controlTransfer(request, value = 0, index = 0, data = null) {
        const result = await this.device.controlTransferOut({
            requestType: 'vendor',
            recipient: 'device',
            request: request,
            value: value,
            index: index,
        }, data ?? new ArrayBuffer(0));
        return result;
    }

    // Bulk OUT: send data to the instrument
    async write(data) {
        const bytes = data instanceof Uint8Array ? data
                    : new TextEncoder().encode(data);
        return this.device.transferOut(this.bulkOutEndpoint, bytes);
    }

    // Bulk IN: receive data from the instrument
    async read(length = 512) {
        const result = await this.device.transferIn(this.bulkInEndpoint, length);
        return new Uint8Array(result.data.buffer);
    }

    async disconnect() {
        await this.device?.releaseInterface(0);
        await this.device?.close();
    }
}

// Example: Vernier Go Direct spectrometer (VID=0x08F7)
const vernier = new InstrumentUSB(0x08F7, 0x0002);
await vernier.connect();
await vernier.write('scan\n');
const spectrum = await vernier.read(2048);
```

### Security model

The browser's USB permission model:
- Origins are granted per (VID, PID, interface) combination.
- Permissions are remembered until the user revokes them at `chrome://settings/content/usbDevices`.
- Permissions are not transferred to other origins.
- The USB permission prompt shows the device's product name and manufacturer.

What WebUSB **cannot** access: devices belonging to HID or Audio classes (those have special handling). Devices claiming those classes are hidden from WebUSB's picker. This prevents a webpage from silently connecting to your keyboard or speakers.

## Web Bluetooth — BLE sensors (10 min)

Bluetooth Low Energy (BLE) uses a **GATT** (Generic Attribute Profile) model. A BLE device exposes **Services**, each containing **Characteristics**. You read/write characteristics; the device optionally notifies you when a characteristic changes.

Example: a portable handheld Raman spectrometer that exposes its spectrum as a GATT characteristic (real devices like the B&W Tek i-Raman series have BLE interfaces):

```javascript
// Connect to a BLE spectrometer
const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: 'RamanSpec' }],
    optionalServices: ['spectral_measurement_service']  // custom UUID
});

const server  = await device.gatt.connect();
const service = await server.getPrimaryService('spectral_measurement_service');

// Read a characteristic once
const specChar = await service.getCharacteristic('spectrum_data');
const rawData  = await specChar.readValue();
// rawData is a DataView
const wavelengths = parseWavelengths(rawData);

// Or: subscribe to notifications (sensor pushes every N seconds)
await specChar.startNotifications();
specChar.addEventListener('characteristicvaluechanged', event => {
    const data = event.target.value;  // DataView
    updateSpectrumPlot(data);
});
```

For a chemistry classroom demo without a real BLE instrument, use the **Web Bluetooth Simulate** DevTools feature:

DevTools → More tools → Bluetooth → "Add a virtual device" → select a GATT profile. Walk students through the picker, connection, and notification stream on the simulated device.

## WebHID — lab balances (5 min)

Some analytical balances (Mettler Toledo, Ohaus) enumerate as USB HID devices and use the HID descriptor to send weight readings.

```javascript
const [device] = await navigator.hid.requestDevice({
    filters: [{ vendorId: 0x0EB8 }]  // Mettler Toledo VID
});

await device.open();

device.addEventListener('inputreport', ({ data, reportId }) => {
    // Parse the HID report — structure is device-specific
    // Typically: stability flag + sign + 6 BCD weight digits + unit
    const stable    = (data.getUint8(0) & 0x01) !== 0;
    const negative  = (data.getUint8(0) & 0x04) !== 0;
    const unit_byte = data.getUint8(1);   // 0x02 = g, 0x03 = kg

    // BCD-encoded weight in remaining bytes
    let weight = 0;
    for (let b = 2; b < data.byteLength; b++) {
        weight = weight * 100 + bcdByte(data.getUint8(b));
    }

    const unit = unit_byte === 0x02 ? 'g' : 'kg';
    console.log(`Balance: ${negative ? '-' : ''}${weight / 100} ${unit} (${stable ? 'stable' : 'unstable'})`);
});
```

Chemistry application: a titration webapp that reads the balance directly — weigh out reagent, watch the UI update in real time, calculate molarity automatically. No manual entry.

## Permissions and the security model (5 min)

All device APIs share these security properties:

- **Explicit user gesture required**: `requestPort()`, `requestDevice()`, etc. must be called from a user gesture (click, key press). You can't silently connect at page load.
- **Browser shows a picker**: the user selects the device from the browser's native UI. The webpage can filter the list but cannot access devices the user didn't choose.
- **HTTPS required**: device APIs only work on secure origins (HTTPS or localhost).
- **Permission is per-origin, per-device**: a permission for `lab.example.com` to talk to VID=0x1234 doesn't grant `evil.com` the same. Permissions are stored in Chrome's profile and revocable at `chrome://settings/content/`.
- **Reconnect without re-prompt**: once granted, `navigator.serial.getPorts()` returns previously-paired ports. No picker needed again.

**The security model exactly matches what a lab wants**: a known page (the lab's web app) can access a known instrument (the one the researcher chose), and nothing else can.

## A tiny code excerpt — Web Serial in Chromium's source (5 min)

Web Serial's implementation is in [`content/browser/serial/`](https://source.chromium.org/chromium/chromium/src/+/main:content/browser/serial/). The Mojo interface is [`third_party/blink/public/mojom/serial/serial.mojom`](https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/public/mojom/serial/serial.mojom).

Show the `.mojom`:

```mojom
interface SerialPort {
    Open(SerialConnectionOptions options) => (bool success);
    StartReading() => (handle<data_pipe_producer> pipe);
    StartWriting() => (handle<data_pipe_consumer> pipe);
    Close() => ();
    GetSignals() => (SerialPortSignals signals);
    SetSignals(SerialPortSignals signals) => (bool success);
};
```

The `data_pipe_producer` / `data_pipe_consumer` are Mojo data pipes — the high-throughput bulk transfer primitive from L20. The serial byte stream flows through them from the serial device → OS driver → browser process → Mojo data pipe → renderer process → your JavaScript `ReadableStream`.

## Live demo (15 min)

### Demo 1 — Web Serial with Arduino spectrometer simulator

Pre-loaded: an Arduino Uno running `arduino_uvvis_sim.ino` from above, connected to the instructor's laptop via USB.

```html
<!-- Open this in Chrome -->
<!DOCTYPE html>
<html><body>
<button onclick="connect()">Connect Spectrometer</button>
<canvas id="plot" width="600" height="300"></canvas>

<script>
const spec = new InstrumentSerial();
const ctx  = document.getElementById('plot').getContext('2d');
const specData = {};

spec.onLine(line => {
    if (line === 'END') {
        drawSpectrum(specData);
        return;
    }
    const parts = line.split(',');
    if (parts.length === 2) {
        specData[Number(parts[0])] = Number(parts[1]);
    }
});

async function connect() {
    await spec.connect(19200);
    await spec.send('SCAN 200 800');
}

function drawSpectrum(data) {
    const wls = Object.keys(data).map(Number).sort((a, b) => a - b);
    const maxA = Math.max(...Object.values(data));
    ctx.clearRect(0, 0, 600, 300);

    // Draw axes
    ctx.strokeStyle = '#999'; ctx.beginPath();
    ctx.moveTo(50, 10); ctx.lineTo(50, 270); ctx.lineTo(590, 270);
    ctx.stroke();

    // Label axes
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif';
    ctx.fillText('200 nm', 50, 285); ctx.fillText('800 nm', 550, 285);
    ctx.fillText('Absorbance', 5, 150);

    // Draw spectrum
    ctx.strokeStyle = '#0055aa'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    wls.forEach((wl, idx) => {
        const px = 50 + (wl - 200) / 600 * 540;
        const py = 270 - (data[wl] / maxA) * 250;
        idx === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Annotate protein peaks
    ctx.fillStyle = 'red'; ctx.font = '11px sans-serif';
    ctx.fillText('Peptide bonds (220 nm)', 80, 50);
    ctx.fillText('Aromatic residues (280 nm)', 310, 80);
}
</script>
</body></html>
```

Click "Connect Spectrometer" → browser shows port picker → select the Arduino → spectrum appears. The whole thing: 60 lines of JavaScript. No drivers, no native app.

### Demo 2 — Permissions visibility

Show `chrome://settings/content/serialPorts` — the previously-granted serial permissions are listed there. Students can see the precise permission record and revoke it.

## Reading for next lecture

- W3C Service Workers specification: [w3c.github.io/ServiceWorker](https://w3c.github.io/ServiceWorker/)
- developer.chrome.com: [Service Worker overview](https://developer.chrome.com/docs/workbox/service-worker-overview)
- web.dev: [Progressive Web Apps training](https://web.dev/learn/pwa/)

## Instructor notes

- HW13 is assigned this lecture. Both the Device API track and the PWA track are available.
- The Arduino demo is the most vivid demo in the unit. Pre-test the USB connection before class. The port selector dialog feels like magic to students who have only used native serial tools.
- If no Arduino is available: Chrome's Serial loopback (`chrome://flags/#enable-experimental-web-platform-features`) provides a virtual serial port. Less dramatic but functional.
- Emphasize HTTPS requirement — `localhost` is OK for development, but a deployed lab instrument app needs a real TLS certificate.

---

[← L24](./L24-webassembly.md) · [Unit VI README](./README.md) · [Next: L26 — PWAs →](./L26-pwas.md)
