import { Platform } from "react-native";

const emulatorUrl = Platform.OS === "android" ? "http://10.0.2.2:4002" : "http://localhost:4002";

export const DEFAULT_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || emulatorUrl;

export function normalizeApiBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_API_BASE_URL;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}
