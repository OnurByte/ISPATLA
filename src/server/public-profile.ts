import type { PublicUserProfile } from "@/server/db-types";
import { getPostgresPublicUserProfile, getPostgresPublicUserProfileByHandle, postgresProfilePath } from "@/server/postgres-public-profile";

// Public profile paths use server-generated, opaque slugs (144 random bits).
export const PUBLIC_PROFILE_SLUG_PATTERN = /^[A-Za-z0-9_-]{24}$/;

export function isPublicProfileSlug(value: string): boolean {
  return PUBLIC_PROFILE_SLUG_PATTERN.test(value) && new Set(value).size >= 12;
}

export async function findPublicProfile(username: string): Promise<PublicUserProfile | null> {
  if (!isPublicProfileSlug(username)) return null;
  return getPostgresPublicUserProfile(username);
}

export function isPublicProfileHandle(value: string): boolean {
  return postgresProfilePath(value, "") === `/${value}`;
}

/** Resolves either a verified X handle at /handle or the legacy opaque /u/handle path. */
export async function findPublicProfileByPath(path: string): Promise<PublicUserProfile | null> {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  if (normalized.startsWith("u/")) return findPublicProfile(normalized.slice(2));
  if (!isPublicProfileHandle(normalized)) return null;
  return getPostgresPublicUserProfileByHandle(normalized);
}

export function validateProfileCompletion(value: Record<string, unknown>): void {
  if (Object.keys(value).length) throw new Error("X profil bilgileri Ispatla üzerinden değiştirilemez");
}
