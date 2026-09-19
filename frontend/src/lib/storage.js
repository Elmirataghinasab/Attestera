// storage.js
//
// Real IPFS storage via Pinata's pinning API. Same two function signatures
// (uploadToStorage / fetchFromStorage) as the earlier mock, so nothing else
// in the app changes.
//
// Setup required (one-time, free):
//   1. Create a free account at https://app.pinata.cloud
//   2. Go to API Keys -> New Key -> enable "pinFileToIPFS" (or just admin)
//   3. Copy the JWT it gives you
//   4. Put it in frontend/.env as VITE_PINATA_JWT=eyJhbG...

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
const PINATA_PIN_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export async function uploadToStorage(encryptedBytes) {
  if (!PINATA_JWT) {
    throw new Error(
      "VITE_PINATA_JWT is not set. Create a free Pinata account at https://app.pinata.cloud, " +
        "generate an API key (JWT), and add it to frontend/.env."
    );
  }

  const blob = new Blob([encryptedBytes]);
  const formData = new FormData();
  formData.append("file", blob, "encrypted-credential");

  const response = await fetch(PINATA_PIN_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Pinata upload failed (${response.status}): ${text || response.statusText}`);
  }

  const result = await response.json();
  return result.IpfsHash;
}

export async function fetchFromStorage(cid) {
  const response = await fetch(`${PINATA_GATEWAY}/${cid}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch document from IPFS (${response.status}). CID: ${cid}`);
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export const IS_MOCK_STORAGE = false;
