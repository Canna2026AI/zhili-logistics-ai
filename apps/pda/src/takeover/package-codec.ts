import { readBlobBytes } from '../offline/blob-bytes';

export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function sha256HexBytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256HexBlob(blob: Blob) {
  return sha256HexBytes(new Uint8Array(await readBlobBytes(blob)));
}

export function decodeBase64(value: string) {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error('接管 IV 不是有效 Base64。');
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (btoa(binary) !== value) throw new Error('接管 IV 不是规范 Base64。');
  return bytes;
}
