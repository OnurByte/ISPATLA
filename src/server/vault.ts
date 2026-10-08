import { currentOwnerId } from "./owner-context";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { deleteSecret, getSecretCiphertext, getSecretMetas, saveSecretCiphertext } from "./db";

const ALGORITHM = "aes-256-gcm";

function key(): Buffer | null {
  const secret = process.env.ISPATLA_SECRET_KEY;
  return secret ? scryptSync(secret, "ispatla-vault-v1", 32) : null;
}

export function vaultReady(): boolean {
  return Boolean(key());
}

export function encryptSecret(value: string): string {
  const encryptionKey = key();
  if (!encryptionKey) throw new Error("ISPATLA_SECRET_KEY must be configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptSecret(value: string): string {
  const encryptionKey = key();
  if (!encryptionKey) throw new Error("ISPATLA_SECRET_KEY must be configured");
  const [version, ivValue, tagValue, ciphertextValue] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("invalid secret envelope");
  const decipher = createDecipheriv(ALGORITHM, encryptionKey, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

export function maskSecret(name: string): string {
  const secret = getSecretCiphertext(name);
  if (!secret) return "ayarlı değil";
  return "••••••••••••";
}

export function listSecretMetas() {
  return getSecretMetas(maskSecret);
}

export function saveSecret(name: string, provider: string, value: string, now = Math.floor(Date.now() / 1000)): void {
  if (!value.trim()) throw new Error("secret value cannot be empty");
  saveSecretCiphertext(name, provider, encryptSecret(value), now);
}

export function readSecret(name: string): string | null {
  const secret = getSecretCiphertext(name);
  return secret ? decryptSecret(secret.ciphertext) : null;
}

export function secretOrEnv(name: string, environmentName: string): string | null {
  const owner = currentOwnerId();
  const sharedEnvironment = !owner || owner === process.env.ISPATLA_OPERATOR_USER_ID ? process.env[environmentName] || null : null;
  try {
    return readSecret(name) || sharedEnvironment;
  } catch {
    return sharedEnvironment;
  }
}

export function removeSecret(name: string): void {
  deleteSecret(name);
}
