import AsyncStorage from '@react-native-async-storage/async-storage';
import * as sqlite from './sqlite';
import { supabase, isSupabaseConfigured } from './supabase';

interface StoredOtpRecord {
  code: string;
  email: string;
  expiresAt: number; // timestamp ms
  purpose: 'signup' | 'login_verify' | 'password_reset';
}

const OTP_STORAGE_PREFIX = 'vaypar_otp_';

/**
 * Generate a random 6-digit OTP code
 */
export function generate6DigitOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send / Register a verification OTP for a specific email
 */
export async function sendEmailOtp(
  email: string,
  purpose: 'signup' | 'login_verify' | 'password_reset' = 'signup'
): Promise<{ success: boolean; code: string; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const code = generate6DigitOtp();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

  const record: StoredOtpRecord = {
    code,
    email: cleanEmail,
    expiresAt,
    purpose,
  };

  // Store in AsyncStorage
  try {
    await AsyncStorage.setItem(`${OTP_STORAGE_PREFIX}${cleanEmail}`, JSON.stringify(record));
  } catch {}

  // Also store in SQLite sync_metadata for persistence
  try {
    const db = await sqlite.getDB();
    await db.runAsync(
      'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
      [`otp_${cleanEmail}`, JSON.stringify(record)]
    );
  } catch {}

  // If Supabase is configured, also trigger remote Supabase email dispatch
  if (isSupabaseConfigured()) {
    try {
      if (purpose === 'password_reset') {
        await supabase.auth.resetPasswordForEmail(cleanEmail);
      } else {
        await supabase.auth.resend({ type: 'signup', email: cleanEmail });
      }
    } catch (e) {
      console.warn('[emailOtp] Supabase resend error:', e);
    }
  }

  return {
    success: true,
    code,
    message: `Verification code generated for ${cleanEmail}`,
  };
}

/**
 * Verify if the entered OTP code matches the code sent to the email
 */
export async function verifyEmailOtpCode(
  email: string,
  enteredCode: string
): Promise<{ valid: boolean; message?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const trimmedCode = enteredCode.trim();

  if (!trimmedCode || trimmedCode.length < 6) {
    return { valid: false, message: 'Please enter a complete 6-digit code.' };
  }

  // 1. Try Supabase verification if configured
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: trimmedCode,
        type: 'signup',
      });
      if (!error && data?.user) {
        return { valid: true };
      }
      const { data: data2, error: error2 } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: trimmedCode,
        type: 'email',
      });
      if (!error2 && data2?.user) {
        return { valid: true };
      }
    } catch {}
  }

  // 2. Check local stored OTP record
  let record: StoredOtpRecord | null = null;
  try {
    const stored = await AsyncStorage.getItem(`${OTP_STORAGE_PREFIX}${cleanEmail}`);
    if (stored) {
      record = JSON.parse(stored);
    }
  } catch {}

  if (!record) {
    try {
      const db = await sqlite.getDB();
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM sync_metadata WHERE key = ?',
        [`otp_${cleanEmail}`]
      );
      if (row?.value) {
        record = JSON.parse(row.value);
      }
    } catch {}
  }

  if (record) {
    if (Date.now() > record.expiresAt) {
      return { valid: false, message: 'Verification code has expired. Please request a new code.' };
    }
    if (record.code === trimmedCode) {
      // Mark email as verified in SQLite
      try {
        const db = await sqlite.getDB();
        const allProfiles = await sqlite.getAllUserProfiles();
        const matchedUser = allProfiles.find(p => p.email && p.email.toLowerCase() === cleanEmail);
        const targetUid = matchedUser ? matchedUser.id : ('local_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_'));
        await db.runAsync(
          'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
          [`email_verified_${targetUid}`, '1']
        );
      } catch {}

      // Clear the used OTP
      try {
        await AsyncStorage.removeItem(`${OTP_STORAGE_PREFIX}${cleanEmail}`);
      } catch {}

      return { valid: true };
    }
  }

  return {
    valid: false,
    message: 'Incorrect 6-digit verification code. Please check your email or resend code.',
  };
}

/**
 * Get active pending OTP code for an email (for simulator/toast)
 */
export async function getActiveOtpForEmail(email: string): Promise<string | null> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const stored = await AsyncStorage.getItem(`${OTP_STORAGE_PREFIX}${cleanEmail}`);
    if (stored) {
      const record: StoredOtpRecord = JSON.parse(stored);
      if (Date.now() <= record.expiresAt) {
        return record.code;
      }
    }
  } catch {}
  return null;
}
