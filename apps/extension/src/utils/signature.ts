import { Buffer } from "buffer/";

export const normalizeSignatureHex = (value: string | Uint8Array): string => {
  if (typeof value === "string") {
    return value.startsWith("0x") ? value.slice(2) : value;
  }
  return Buffer.from(value).toString("hex");
};

export const normalizeSignatureV = (
  value: string | Uint8Array | number | bigint | undefined
): number => {
  if (value == null) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const trimmed = value.startsWith("0x") ? value.slice(2) : value;
    const radix = value.startsWith("0x") ? 16 : 10;
    const parsed = Number.parseInt(trimmed, radix);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  const hex = normalizeSignatureHex(value);
  return hex ? Number.parseInt(hex, 16) : 0;
};

export const normalizeScalarHex = (value: string | Uint8Array): Uint8Array => {
  const hex = normalizeSignatureHex(value);
  const raw = Buffer.from(hex, "hex");
  if (raw.length > 32) {
    throw new Error("Invalid signature length");
  }
  if (raw.length === 32) {
    return raw;
  }
  const padded = Buffer.alloc(32);
  raw.copy(padded, 32 - raw.length);
  return padded;
};
