import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const DEFAULT_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://vyapar-demo.supabase.co';
const DEFAULT_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demoKey';

const STORAGE_KEY_URL = 'vaypar_custom_supabase_url';
const STORAGE_KEY_KEY = 'vaypar_custom_supabase_anon_key';

// Platform-aware storage adapter with dynamic require for native SecureStore to avoid web imports
const getPlatformStorage = () => {
  if (Platform.OS === 'web') {
    return {
      getItem: async (key: string) => {
        try {
          return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
        } catch {
          return null;
        }
      },
      setItem: async (key: string, value: string) => {
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem(key, value);
          }
        } catch {}
      },
      removeItem: async (key: string) => {
        try {
          if (typeof window !== 'undefined') {
            localStorage.removeItem(key);
          }
        } catch {}
      },
    };
  } else {
    // Only load expo-secure-store on native devices
    try {
      const SecureStore = require('expo-secure-store');
      return {
        getItem: async (key: string) => {
          return await SecureStore.getItemAsync(key);
        },
        setItem: async (key: string, value: string) => {
          await SecureStore.setItemAsync(key, value);
        },
        removeItem: async (key: string) => {
          await SecureStore.deleteItemAsync(key);
        },
      };
    } catch {
      return {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      };
    }
  }
};

const PlatformSecureStorageAdapter = getPlatformStorage();

let activeUrl = DEFAULT_URL;
let activeAnonKey = DEFAULT_ANON_KEY;
let activeClient: SupabaseClient = createClient(activeUrl, activeAnonKey, {
  auth: {
    storage: PlatformSecureStorageAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

function createNewClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      storage: PlatformSecureStorageAdapter as any,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Check if active Supabase client is pointing to a live production Supabase instance
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    activeUrl &&
    !activeUrl.includes('vyapar-demo.supabase.co') &&
    activeAnonKey &&
    !activeAnonKey.includes('demoKey')
  );
}

/**
 * Get active Supabase configuration metadata
 */
export function getSupabaseConfig(): { url: string; isConfigured: boolean; isCustom: boolean } {
  return {
    url: activeUrl,
    isConfigured: isSupabaseConfigured(),
    isCustom: activeUrl !== DEFAULT_URL,
  };
}

/**
 * Configure Supabase credentials at runtime and verify connection
 */
export async function configureSupabase(url: string, anonKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    const cleanKey = anonKey.trim();

    if (!cleanUrl.startsWith('https://')) {
      return { success: false, error: 'Supabase URL must start with https://' };
    }
    if (!cleanKey || cleanKey.length < 20) {
      return { success: false, error: 'Invalid Supabase Anon Public Key provided' };
    }

    const testClient = createNewClient(cleanUrl, cleanKey);

    // Verify client responsiveness
    const { error: sessionError } = await testClient.auth.getSession();
    if (sessionError && !sessionError.message?.toLowerCase().includes('session')) {
      return { success: false, error: sessionError.message || 'Failed to authenticate with Supabase endpoint' };
    }

    // Persist configuration
    await PlatformSecureStorageAdapter.setItem(STORAGE_KEY_URL, cleanUrl);
    await PlatformSecureStorageAdapter.setItem(STORAGE_KEY_KEY, cleanKey);

    activeUrl = cleanUrl;
    activeAnonKey = cleanKey;
    activeClient = testClient;

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Connection test failed' };
  }
}

/**
 * Reset to default environment configuration
 */
export async function resetSupabaseConfig(): Promise<void> {
  await PlatformSecureStorageAdapter.removeItem(STORAGE_KEY_URL);
  await PlatformSecureStorageAdapter.removeItem(STORAGE_KEY_KEY);
  activeUrl = DEFAULT_URL;
  activeAnonKey = DEFAULT_ANON_KEY;
  activeClient = createNewClient(activeUrl, activeAnonKey);
}

/**
 * Initialize custom credentials if stored in persistent storage
 */
export async function loadStoredSupabaseConfig(): Promise<void> {
  try {
    const storedUrl = await PlatformSecureStorageAdapter.getItem(STORAGE_KEY_URL);
    const storedKey = await PlatformSecureStorageAdapter.getItem(STORAGE_KEY_KEY);
    if (storedUrl && storedKey) {
      activeUrl = storedUrl;
      activeAnonKey = storedKey;
      activeClient = createNewClient(storedUrl, storedKey);
    }
  } catch {}
}

// Immediately load stored config asynchronously on module import
loadStoredSupabaseConfig().catch(() => {});

/**
 * Transparent proxy to the active client so calls to `supabase.from(...)` or `supabase.auth...`
 * always resolve dynamically to the current active client instance.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (activeClient as any)[prop];
  },
});

