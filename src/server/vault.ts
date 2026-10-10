import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import {
  deletePostgresSecret,
  decryptPostgresSecret,
  encryptPostgresSecret,
  getPostgresSecret,
  getPostgresSecretValue,
  listPostgresSecretMetas,
  postgresVaultReady,
  savePostgresSecret,
} from "./postgres-settings";

const ALGORITHM = "aes-256-gcm";

function key(): Buffer | null {
  const secret = process.env.ISPATLA_SECRET_KEY;
  return secret ? scryptSync(secret, "ispatla-vault-v1", 32) : null;
}

export function vaultReady(): boolean { return postgresVaultReady(); }

export function encryptSecret(value: string): string {
  const encryptionKey = key();
  if (!encryptionKey) throw new Error("ISPATLA_SECRET_KEY must be configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":");
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

export async function maskPostgresSecret(name: string): Promise<string> {
  return await getPostgresSecret(name) ? "••••••••••••" : "ayarlı değil";
}

export async function listPostgresSecretMetasForOwner() { return listPostgresSecretMetas(); }

export async function savePostgresSecretValue(name: string, provider: string, value: string, now = Math.floor(Date.now() / 1000)): Promise<void> {
  if (!value.trim()) throw new Error("secret value cannot be empty");
  await savePostgresSecret(name, provider, encryptSecret(value), now);
}

export async function readPostgresSecretValue(name: string): Promise<string | null> {
  const secret = await getPostgresSecret(name);
  return secret ? decryptPostgresSecret(secret.ciphertext) : null;
}

export async function postgresSecretOrEnv(name: string, environmentName: string): Promise<string | null> {
  return getPostgresSecretValue(name, environmentName);
}

export async function removePostgresSecret(name: string): Promise<void> { await deletePostgresSecret(name); }
