import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { DEFAULT_API_BASE_URL } from "./config";
import type { AuthSession } from "./types";

const authKey = "words-check:auth";
const apiBaseUrlKey = "words-check:api-base-url";
const deviceFingerprintKey = "words-check:device-fingerprint";

async function secureSet(key: string, value: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function secureGet(key: string) {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function secureDelete(key: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export async function saveAuthSession(auth: AuthSession) {
  await secureSet(authKey, JSON.stringify(auth));
}

export async function loadAuthSession() {
  const raw = await secureGet(authKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    await secureDelete(authKey);
    return null;
  }
}

export function clearAuthSession() {
  return secureDelete(authKey);
}

export async function loadApiBaseUrl() {
  return (await AsyncStorage.getItem(apiBaseUrlKey)) || DEFAULT_API_BASE_URL;
}

export function saveApiBaseUrl(value: string) {
  return AsyncStorage.setItem(apiBaseUrlKey, value);
}

export async function loadDeviceFingerprint() {
  const existing = await AsyncStorage.getItem(deviceFingerprintKey);
  if (existing) return existing;

  const generated = `mobile-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  await AsyncStorage.setItem(deviceFingerprintKey, generated);
  return generated;
}

function examDraftKey(sessionId: string) {
  return `words-check:exam-draft:${sessionId}`;
}

export async function loadExamDraft(sessionId: string) {
  const raw = await AsyncStorage.getItem(examDraftKey(sessionId));
  if (!raw) return {};

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    await AsyncStorage.removeItem(examDraftKey(sessionId));
    return {};
  }
}

export function saveExamDraft(sessionId: string, answers: Record<string, string>) {
  return AsyncStorage.setItem(examDraftKey(sessionId), JSON.stringify(answers));
}

export function clearExamDraft(sessionId: string) {
  return AsyncStorage.removeItem(examDraftKey(sessionId));
}
