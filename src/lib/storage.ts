import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store wraps native Keychain/Keystore and has no web
// implementation. On web we fall back to localStorage. Note this is a
// weaker guarantee than native (not encrypted at rest) — acceptable for
// most session/preference data, worth revisiting if you store anything
// more sensitive later.
export async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch { return null; }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
    await SecureStore.setItemAsync(key, value);
  } catch {}
}

export async function removeItem(key: string): Promise<void> {
  try {
    if (Platform.OS === 'web') { localStorage.removeItem(key); return; }
    await SecureStore.deleteItemAsync(key);
  } catch {}
}
