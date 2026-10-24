export function readFileAsBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------
// Filename packing — preserves the ORIGINAL filename (and its extension)
// through the encrypt/store/decrypt round trip.
// ---------------------------------------------------------------------
// Without this, the app only ever had a made-up name like
// "credential-0x0c22b1b3" to give the browser on download — no extension
// at all, so the OS has nothing to go on and the download shows up
// unopenable (e.g. as a generic .dms file). Packing the real filename
// into the plaintext BEFORE encryption means it travels alongside the
// document itself, encrypted together, and comes back out correctly at
// decryption time — no separate on-chain or IPFS storage needed for it.
//
// Format: [2 bytes: filename length, big-endian][filename, UTF-8][file bytes]

export function packWithFilename(fileBytes, filename) {
  const nameBytes = new TextEncoder().encode(filename);
  const lengthPrefix = new Uint8Array(2);
  new DataView(lengthPrefix.buffer).setUint16(0, nameBytes.length, false);

  const packed = new Uint8Array(2 + nameBytes.length + fileBytes.length);
  packed.set(lengthPrefix, 0);
  packed.set(nameBytes, 2);
  packed.set(fileBytes, 2 + nameBytes.length);
  return packed;
}

// Reads the packed format written by packWithFilename. Credentials issued before
// filename packing existed contain the raw file bytes, so when the header does not
// look like a valid [length][filename] pair we treat the data as a legacy raw file and
// guess its extension from the first bytes (magic numbers).
function sniffExtension(b) {
  const starts = (...sig) => sig.every((v, i) => b[i] === v);
  if (starts(0x25, 0x50, 0x44, 0x46)) return ".pdf";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return ".png";
  if (starts(0xff, 0xd8, 0xff)) return ".jpg";
  if (starts(0x50, 0x4b, 0x03, 0x04)) return ".docx";
  if (starts(0x47, 0x49, 0x46, 0x38)) return ".gif";
  return ".bin";
}

export function unpackWithFilename(packedBytes, fallbackBase = "credential") {
  if (packedBytes.length > 2) {
    const nameLength = new DataView(packedBytes.buffer, packedBytes.byteOffset, 2).getUint16(0, false);
    if (nameLength > 0 && nameLength <= 255 && 2 + nameLength <= packedBytes.length) {
      try {
        const filename = new TextDecoder("utf-8", { fatal: true }).decode(packedBytes.slice(2, 2 + nameLength));
        // eslint-disable-next-line no-control-regex
        if (/^[^\x00-\x1f/\\]+\.[A-Za-z0-9]{1,8}$/.test(filename)) {
          return { filename, bytes: packedBytes.slice(2 + nameLength) };
        }
      } catch {
        // not valid UTF-8 -> legacy format
      }
    }
  }
  return { filename: fallbackBase + sniffExtension(packedBytes), bytes: packedBytes };
}
