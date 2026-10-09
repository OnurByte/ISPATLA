import { getPublicUserProfile, getPublicUserProfileByHandle, profilePathForIdentity, type PublicUserProfile } from "@/server/db";

// Public profile paths use server-generated, opaque slugs (144 random bits).
export const PUBLIC_PROFILE_SLUG_PATTERN = /^[A-Za-z0-9_-]{24}$/;

export function isPublicProfileSlug(value: string): boolean {
  return PUBLIC_PROFILE_SLUG_PATTERN.test(value) && new Set(value).size >= 12;
}

export function findPublicProfile(username: string): PublicUserProfile | null {
  if (!isPublicProfileSlug(username)) return null;
  return getPublicUserProfile(username);
}

export function isPublicProfileHandle(value: string): boolean {
  return profilePathForIdentity(value, "") === `/${value}`;
}

/** Resolves either a verified X handle at /handle or the legacy opaque /u/handle path. */
export function findPublicProfileByPath(path: string): PublicUserProfile | null {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  if (normalized.startsWith("u/")) return findPublicProfile(normalized.slice(2));
  if (!isPublicProfileHandle(normalized)) return null;
  return getPublicUserProfileByHandle(normalized);
}

export type ProfileUpdate = { displayName: string; bio: string; visibility: "private" | "public" };

export function validateProfileUpdate(value: Record<string, unknown>): ProfileUpdate {
  if (Object.keys(value).some((field) => !["displayName", "bio", "visibility"].includes(field))) throw new Error("profil bağlantısı değiştirilemez");
  const displayName = typeof value.displayName === "string" ? value.displayName.trim() : "";
  const bio = typeof value.bio === "string" ? value.bio.trim() : "";
  if (displayName.length > 80) throw new Error("görünen ad en fazla 80 karakter olabilir");
  if (bio.length > 500) throw new Error("bio en fazla 500 karakter olabilir");
  if (value.visibility !== "private" && value.visibility !== "public") throw new Error("görünürlük private veya public olmalı");
  return { displayName, bio, visibility: value.visibility };
}
