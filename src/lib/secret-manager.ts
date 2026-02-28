import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = path.join(os.homedir(), ".rexipt", "ai-employee");
const keyPath = path.join(dataDir, "secrets.key");
const ENCRYPTION_PREFIX = "enc:v1:";

async function ensureDir(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
}

async function getOrCreateKey(): Promise<Buffer> {
  await ensureDir();
  try {
    const existing = await fs.readFile(keyPath, "utf8");
    return Buffer.from(existing.trim(), "base64");
  } catch {
    const key = crypto.randomBytes(32);
    await fs.writeFile(keyPath, key.toString("base64"), { mode: 0o600 });
    return key;
  }
}

export function isEncryptedValue(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

export async function encryptString(plain: string): Promise<string> {
  if (!plain || isEncryptedValue(plain)) {
    return plain;
  }

  const key = await getOrCreateKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString("base64");
  return `${ENCRYPTION_PREFIX}${payload}`;
}

export async function decryptString(value: string): Promise<string> {
  if (!value || !isEncryptedValue(value)) {
    return value;
  }

  const key = await getOrCreateKey();
  const payload = Buffer.from(value.slice(ENCRYPTION_PREFIX.length), "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
