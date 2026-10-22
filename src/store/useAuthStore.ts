import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import * as sqlite from '../services/sqlite';
import { runSync } from '../services/sync';
import { Platform } from 'react-native';
import type { UserRole } from '../types';

export interface UserSession {
  id: string;
  businessId: string;
  role: UserRole;
  name: string;
  email: string;
  phone: string;
  salary: number;
  joiningDate: string;
  status: 'active' | 'inactive';
  businessName: string;
  address: string;
  logoUri: string;
  businessCategory?: string;
  lastUpdated: string;
}

interface AuthState {
  user: UserSession | null;
  loading: boolean;
  isDemoMode: boolean;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    businessName: string,
    phone?: string,
    address?: string,
    logoUri?: string,
    businessCategory?: string,
    bizAnswers?: Record<string, unknown>
  ) => Promise<void>;
  updateProfile: (businessName: string, phone: string, address: string, logoUri: string) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, newPassword: string, otpCode?: string) => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  loginWithPin: (pin: string) => Promise<void>;
  setUserPin: (pin: string) => Promise<void>;
  getUserPin: () => Promise<string>;
  switchToDemoMode: (category?: string) => Promise<void>;
  switchToKitchenDemoMode: () => Promise<void>;
  loginLocalProfile: (uid: string, email: string) => Promise<sqlite.UserProfile | sqlite.UserSessionCombined | null>;
  runCategoryOnboardingSetup: (businessId: string, category: string, answers: Record<string, unknown>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  isDemoMode: false,

  initialize: async () => {
    set({ loading: true });
    
    // 1. Check local demo session first
    const demoProfile = await sqlite.getUserProfileCombined('local_user');
    if (demoProfile) {
      set({ user: demoProfile as UserSession, isDemoMode: true, loading: false });
      return;
    }

    // 2. Check Supabase session
    if (isSupabaseConfigured()) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          const uid = session.user.id;
          let profile = await sqlite.getUserProfileCombined(uid);
          if (!profile) {
            // Fetch from Supabase with joined business
            const { data: remoteProfile } = await supabase
              .from('profiles')
              .select('*, businesses(*)')
              .eq('id', uid)
              .maybeSingle();

            if (remoteProfile) {
              const bId = remoteProfile.business_id;
              const biz = remoteProfile.businesses;
              const now = new Date().toISOString();
              await sqlite.upsertBusinessProfile({
                id: bId,
                businessName: biz?.business_name || 'My Business',
                phone: biz?.phone || '',
                address: biz?.address || '',
                logoUri: biz?.logo_uri || '',
                businessCategory: biz?.business_category || 'general',
                synced: 1,
                lastUpdated: biz?.last_updated || now,
              });
              await sqlite.upsertUserProfile({
                id: uid,
                businessId: bId,
                role: remoteProfile.role || 'owner',
                name: remoteProfile.name || 'User',
                email: remoteProfile.email || session.user.email || '',
                phone: remoteProfile.phone || '',
                salary: remoteProfile.salary || 0,
                joiningDate: remoteProfile.joining_date || now,
                status: remoteProfile.status || 'active',
                synced: 1,
                lastUpdated: remoteProfile.last_updated || now,
              });
              profile = await sqlite.getUserProfileCombined(uid);
            }
          }
          if (profile) {
            set({ user: profile as UserSession, isDemoMode: false });
            // Background non-blocking sync for cloud freshness
            runSync(uid).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('[useAuthStore] Supabase init session failed:', err);
      }
    }
    set({ loading: false });
  },

  login: async (email, password) => {
    if (!isSupabaseConfigured()) {
      // Offline local auth logic
      const db = await sqlite.getDB();
      const allProfiles = await sqlite.getAllUserProfiles();
      const matchedUser = allProfiles.find(p => p.email && p.email.toLowerCase() === email.toLowerCase());

      if (!matchedUser && email === 'demo@business.local') {
        const profile = await get().loginLocalProfile('local_user', 'demo@business.local');
        set({ user: profile as UserSession, isDemoMode: true });
        return;
      }

      if (!matchedUser) throw new Error('Local account not found.');

      const uid = matchedUser.id;
      const storedPwdResult = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM sync_metadata WHERE key = ?',
        ['pwd_' + uid]
      );

      if (!storedPwdResult || storedPwdResult.value !== password) {
        throw new Error('Incorrect credentials.');
      }

      // Check if email is verified in local store
      const verifiedResult = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM sync_metadata WHERE key = ?',
        ['email_verified_' + uid]
      );
      if (verifiedResult && verifiedResult.value === '0') {
        throw new Error('Email not verified. Please verify your email before logging in.');
      }

      const profile = await sqlite.getUserProfileCombined(uid);
      if (!profile) throw new Error('Failed to load local profile.');
      
      set({ user: profile as UserSession, isDemoMode: false });
      return;
    }

    // Supabase Live Login
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (
        error.message?.toLowerCase().includes('email not confirmed') ||
        error.message?.toLowerCase().includes('not confirmed') ||
        (error.status === 400 && error.message?.toLowerCase().includes('confirm'))
      ) {
        throw new Error('Email not verified. Please check your inbox and verify your email before logging in.');
      }
      throw error;
    }
    if (!data.user) throw new Error('Auth session not initialized.');

    // Strict enforcement: Only verified email can login
    const isConfirmed = !!(
      data.user.email_confirmed_at ||
      data.user.confirmed_at ||
      (data.user as any).user_metadata?.email_verified
    );

    if (!isConfirmed) {
      await supabase.auth.signOut();
      throw new Error('Email not verified. Please verify your email address before logging in.');
    }

    const uid = data.user.id;
    const now = new Date().toISOString();

    // Fetch verified profile and linked business from Supabase
    const { data: remoteProfile } = await supabase
      .from('profiles')
      .select('*, businesses(*)')
      .eq('id', uid)
      .maybeSingle();

    let userSession: UserSession;

    if (remoteProfile) {
      const bId = remoteProfile.business_id;
      const biz = remoteProfile.businesses;
      await sqlite.upsertBusinessProfile({
        id: bId,
        businessName: biz?.business_name || 'My Business',
        phone: biz?.phone || '',
        address: biz?.address || '',
        logoUri: biz?.logo_uri || '',
        businessCategory: biz?.business_category || 'general',
        synced: 1,
        lastUpdated: biz?.last_updated || now,
      });

      await sqlite.upsertUserProfile({
        id: uid,
        businessId: bId,
        role: remoteProfile.role || 'owner',
        name: remoteProfile.name || 'User',
        email: remoteProfile.email || data.user.email || '',
        phone: remoteProfile.phone || '',
        salary: remoteProfile.salary || 0,
        joiningDate: remoteProfile.joining_date || now,
        status: remoteProfile.status || 'active',
        synced: 1,
        lastUpdated: remoteProfile.last_updated || now,
      });

      // Synchronize cloud records (products, sales, expenses) for this business
      try {
        await runSync(uid);
      } catch (syncErr) {
        console.warn('[useAuthStore] Initial cloud sync on login:', syncErr);
      }

      const combined = await sqlite.getUserProfileCombined(uid);
      userSession = combined as UserSession;
    } else {
      // First-time login without an existing profile row in Supabase
      const fallback = await (get() as any).loginLocalProfile(uid, data.user.email || '');
      userSession = fallback as UserSession;

      try {
        await supabase.from('businesses').insert({
          id: userSession.businessId,
          business_name: userSession.businessName || 'My Business',
          business_category: 'general',
          last_updated: now,
        });
        await supabase.from('profiles').insert({
          id: uid,
          business_id: userSession.businessId,
          role: userSession.role || 'owner',
          name: userSession.name || 'Business Owner',
          email: userSession.email || '',
          last_updated: now,
        });
      } catch (insertErr) {
        console.warn('[useAuthStore] Cloud profile bootstrap notice:', insertErr);
      }
    }

    set({ user: userSession, isDemoMode: false });
  },

  signUp: async (email, password, businessName, phone = '', address = '', logoUri = '', businessCategory = 'general', bizAnswers: Record<string, unknown> = {}) => {
    try {
      const now = new Date().toISOString();
      const isCloudReady = isSupabaseConfigured();
      const businessId = 'biz_' + Math.random().toString(36).substring(2, 11);
      const uid = isCloudReady 
        ? null 
        : 'local_' + email.replace(/[^a-zA-Z0-9]/g, '_');

      // Local / Offline Sign Up
      if (!isCloudReady) {
        const db = await sqlite.getDB();
        const finalUid = 'local_' + email.replace(/[^a-zA-Z0-9]/g, '_');
        await db.runAsync('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)', ['pwd_' + finalUid, password]);
        
        const defaultBiz: sqlite.BusinessProfile = {
          id: businessId,
          businessName,
          phone,
          address,
          logoUri,
          businessCategory,
          synced: 0,
          lastUpdated: now,
        };
        await sqlite.upsertBusinessProfile(defaultBiz);

        // Update category explicitly
        try {
          await db.runAsync(
            "UPDATE businesses SET businessCategory = ? WHERE id = ?",
            [businessCategory, businessId]
          );
        } catch (e) {}

        const defaultOwner: sqlite.UserProfile = {
          id: finalUid,
          businessId,
          role: 'owner',
          name: 'Business Owner',
          email,
          phone,
          salary: 0,
          joiningDate: now,
          status: 'active',
          synced: 0,
          lastUpdated: now,
        };
        await sqlite.upsertUserProfile(defaultOwner);
        // Save user-configured Quick PIN if provided
        if (bizAnswers && bizAnswers.pin) {
          await sqlite.setUserPin(finalUid, String(bizAnswers.pin));
        }

        // Run category-specific setup triggers (Onboarding Phase 5-6)
        await get().runCategoryOnboardingSetup(businessId, businessCategory, bizAnswers);

        const profile = await sqlite.getUserProfileCombined(finalUid);
        set({ user: profile as UserSession, isDemoMode: false });
        return;
      }

      // Supabase Sign Up or Active Session Retrieval
      let supabaseUid: string;
      let isConfirmed = false;
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      if (existingSession && existingSession.user) {
        supabaseUid = existingSession.user.id;
        isConfirmed = true;
      } else {
        const { data: suData, error: suError } = await supabase.auth.signUp({ email: email.trim(), password });
        if (suError) {
          // If already registered in Step 1, sign in to acquire session
          const { data: sData, error: sErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          if (sErr || !sData.user) throw suError;
          supabaseUid = sData.user.id;
          isConfirmed = !!(
            sData.user.email_confirmed_at ||
            (sData.user as any).confirmed_at ||
            sData.session
          );
        } else {
          if (!suData.user) throw new Error('Email verification link sent.');
          supabaseUid = suData.user.id;
          isConfirmed = !!(
            suData.user.email_confirmed_at ||
            (suData.user as any).confirmed_at ||
            suData.session
          );
        }
      }
      
      // Save business and profile locally first
      const defaultBiz: sqlite.BusinessProfile = {
        id: businessId,
        businessName,
        phone,
        address,
        logoUri,
        businessCategory,
        synced: 0,
        lastUpdated: now,
      };
      await sqlite.upsertBusinessProfile(defaultBiz);

      const defaultOwner: sqlite.UserProfile = {
        id: supabaseUid,
        businessId,
        role: 'owner',
        name: 'Business Owner',
        email,
        phone,
        salary: 0,
        joiningDate: now,
        status: 'active',
        synced: 0,
        lastUpdated: now,
      };
      await sqlite.upsertUserProfile(defaultOwner);

      // Save user-configured Quick PIN if provided
      if (bizAnswers && bizAnswers.pin) {
        await sqlite.setUserPin(supabaseUid, String(bizAnswers.pin));
      }

      // Run Category-Specific setup
      await get().runCategoryOnboardingSetup(businessId, businessCategory, bizAnswers);

      // Sync user profile & business directly to Supabase
      try {
        const { error: bErr } = await supabase.from('businesses').insert({
          id: businessId,
          business_name: businessName,
          phone,
          address,
          logo_uri: logoUri,
          business_category: businessCategory,
          last_updated: now,
        });
        if (bErr) console.warn('[useAuthStore] Business insert warning:', bErr.message);

        const { error: pErr } = await supabase.from('profiles').insert({
          id: supabaseUid,
          business_id: businessId,
          role: 'owner',
          name: 'Business Owner',
          email,
          phone,
          salary: 0,
          joining_date: now,
          status: 'active',
          last_updated: now,
        });
        if (pErr) console.warn('[useAuthStore] Profile insert warning:', pErr.message);

        if (!bErr && !pErr) {
          await sqlite.markBusinessProfileSynced(businessId);
          await sqlite.markUserProfileSynced(supabaseUid);
        }
      } catch (err) {
        console.warn('[useAuthStore] Direct Supabase push failed (queued offline):', err);
      }

      if (!isConfirmed) {
        set({ user: null, isDemoMode: false, loading: false });
        throw new Error('VERIFICATION_REQUIRED:' + email.trim());
      }

      set({
        user: {
          id: supabaseUid,
          businessId,
          role: 'owner',
          name: 'Business Owner',
          email,
          phone,
          salary: 0,
          joiningDate: now,
          status: 'active',
          businessName,
          address,
          logoUri,
          lastUpdated: now,
        },
        isDemoMode: false,
      });
    } catch (err) {
      throw err;
    }
  },

  updateProfile: async (businessName, phone, address, logoUri) => {
    const { user } = get();
    if (!user) throw new Error('No active login session.');

    const now = new Date().toISOString();
    const updatedBiz: sqlite.BusinessProfile = {
      id: user.businessId,
      businessName,
      phone,
      address,
      logoUri,
      synced: 0,
      lastUpdated: now,
    };

    await sqlite.upsertBusinessProfile(updatedBiz);

    if (isSupabaseConfigured() && !get().isDemoMode) {
      try {
        await supabase.from('businesses').update({
          business_name: businessName,
          phone,
          address,
          logo_uri: logoUri,
          last_updated: now
        }).eq('id', user.businessId);
      } catch (err) {
        console.warn('[useAuthStore] Supabase profile update failed (sync-deferred):', err);
      }
    }

    set({
      user: {
        ...user,
        businessName,
        phone,
        address,
        logoUri,
      }
    });
  },

  logout: async () => {
    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('[useAuthStore] Supabase signOut error:', err);
    }

    // Clean up local demo user session
    if (get().isDemoMode) {
      try {
        const db = await sqlite.getDB();
        await db.runAsync("DELETE FROM users WHERE id = 'local_user'");
        await db.runAsync("DELETE FROM businesses WHERE id = 'local_business'");
      } catch (e) {}
    }

    set({ user: null, isDemoMode: false });
  },

  forgotPassword: async (email: string) => {
    if (isSupabaseConfigured()) {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'vaypar://reset-password',
      });
      if (error) throw error;
    } else {
      const all = await sqlite.getAllUserProfiles();
      const found = all.find(p => p.email && p.email.toLowerCase() === email.trim().toLowerCase());
      if (!found && email.trim().toLowerCase() !== 'demo@business.local' && email.trim().toLowerCase() !== 'owner@vaypar.pk') {
        // Still allow offline simulated reset
      }
    }
  },

  resetPassword: async (email: string, newPassword: string, otpCode?: string) => {
    if (isSupabaseConfigured()) {
      if (otpCode) {
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otpCode.trim(),
          type: 'recovery',
        });
        if (verifyErr) throw verifyErr;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) throw updateErr;
    } else {
      const db = await sqlite.getDB();
      const all = await sqlite.getAllUserProfiles();
      const found = all.find(p => p.email && p.email.toLowerCase() === email.trim().toLowerCase());
      const targetUid = found ? found.id : ('local_' + email.replace(/[^a-zA-Z0-9]/g, '_'));
      await db.runAsync(
        'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
        ['pwd_' + targetUid, newPassword]
      );
    }
  },

  resendVerificationEmail: async (email: string) => {
    if (isSupabaseConfigured()) {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      });
      if (error) throw error;
    }
  },

  verifyEmailOtp: async (email: string, token: string) => {
    set({ loading: true });
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: token.trim(),
          type: 'signup',
        });
        const targetUser = data?.user || (error ? null : null);
        let finalUser = targetUser;
        if (error) {
          const { data: data2, error: error2 } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token: token.trim(),
            type: 'email',
          });
          if (error2) throw error;
          finalUser = data2?.user || null;
        }

        if (finalUser) {
          const uid = finalUser.id;
          let profile = await sqlite.getUserProfileCombined(uid);
          if (!profile) {
            const { data: remoteProfile } = await supabase
              .from('profiles')
              .select('*, businesses(*)')
              .eq('id', uid)
              .maybeSingle();

            if (remoteProfile) {
              const bId = remoteProfile.business_id;
              const biz = remoteProfile.businesses;
              const now = new Date().toISOString();
              await sqlite.upsertBusinessProfile({
                id: bId,
                businessName: biz?.business_name || 'My Business',
                phone: biz?.phone || '',
                address: biz?.address || '',
                logoUri: biz?.logo_uri || '',
                businessCategory: biz?.business_category || 'general',
                synced: 1,
                lastUpdated: biz?.last_updated || now,
              });
              await sqlite.upsertUserProfile({
                id: uid,
                businessId: bId,
                role: remoteProfile.role || 'owner',
                name: remoteProfile.name || 'User',
                email: remoteProfile.email || finalUser.email || '',
                phone: remoteProfile.phone || '',
                salary: remoteProfile.salary || 0,
                joiningDate: remoteProfile.joining_date || now,
                status: remoteProfile.status || 'active',
                synced: 1,
                lastUpdated: remoteProfile.last_updated || now,
              });
              profile = await sqlite.getUserProfileCombined(uid);
            }
          }
          if (profile) {
            set({ user: profile as UserSession, isDemoMode: false, loading: false });
            runSync(uid).catch(() => {});
            return;
          }
        }
      } else {
        const db = await sqlite.getDB();
        const all = await sqlite.getAllUserProfiles();
        const found = all.find(p => p.email && p.email.toLowerCase() === email.trim().toLowerCase());
        const targetUid = found ? found.id : ('local_' + email.replace(/[^a-zA-Z0-9]/g, '_'));
        await db.runAsync(
          'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
          ['email_verified_' + targetUid, '1']
        );
        if (found) {
          const profile = await sqlite.getUserProfileCombined(targetUid);
          if (profile) {
            set({ user: profile as UserSession, isDemoMode: false, loading: false });
          }
        }
      }
    } finally {
      set({ loading: false });
    }
  },

  loginWithPin: async (pin: string) => {
    if (pin.length !== 4) throw new Error('PIN must be exactly 4 digits');
    const profile = await sqlite.loginWithQuickPin(pin);
    if (!profile) {
      throw new Error('Invalid PIN code. No profile or staff account is configured with this 4-digit PIN.');
    }
    set({
      user: profile as UserSession,
      isDemoMode: profile.id.startsWith('local_') || profile.id.includes('demo')
    });
  },

  setUserPin: async (pin: string) => {
    const { user } = get();
    if (!user) throw new Error('No active user session');
    if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits');
    await sqlite.setUserPin(user.id, pin);
  },

  getUserPin: async () => {
    const { user } = get();
    if (!user) return '1234';
    return await sqlite.getUserPin(user.id);
  },

  switchToDemoMode: async (businessCategory = 'general') => {
    const now = new Date().toISOString();
    
    const demoBiz: sqlite.BusinessProfile = {
      id: 'local_business',
      businessName: 'My Demo Business',
      phone: '+92 300 0000000',
      address: 'Main Market, City',
      logoUri: '',
      businessCategory,
      synced: 1,
      lastUpdated: now,
    };
    await sqlite.upsertBusinessProfile(demoBiz);

    const db = await sqlite.getDB();
    try {
      await db.runAsync(
        "UPDATE businesses SET businessCategory = ? WHERE id = 'local_business'",
        [businessCategory]
      );
    } catch (e) {}

    const demoUser: sqlite.UserProfile = {
      id: 'local_user',
      businessId: 'local_business',
      role: 'owner',
      name: 'Business Owner',
      email: 'demo@business.local',
      phone: '+92 300 0000000',
      salary: 0,
      joiningDate: now,
      status: 'active',
      synced: 1,
      lastUpdated: now,
    };
    await sqlite.upsertUserProfile(demoUser);

    // Seed mock data depending on category
    await get().runCategoryOnboardingSetup('local_business', businessCategory, {
      tablesCount: 5,
      plansType: 'default',
    });

    const session = await sqlite.getUserProfileCombined('local_user');
    set({ user: session as UserSession, isDemoMode: true });
  },

  switchToKitchenDemoMode: async () => {
    const now = new Date().toISOString();

    const demoBiz: sqlite.BusinessProfile = {
      id: 'local_business',
      businessName: 'Spicy Bistro Cookhouse',
      phone: '+92 300 1234567',
      address: 'Food Court, Block 3',
      logoUri: '',
      businessCategory: 'restaurant',
      synced: 1,
      lastUpdated: now,
    };
    await sqlite.upsertBusinessProfile(demoBiz);

    const demoUser: sqlite.UserProfile = {
      id: 'local_user',
      businessId: 'local_business',
      role: 'kitchen',
      name: 'Head Chef',
      email: 'chef@kitchen.local',
      phone: '+92 300 1234567',
      salary: 0,
      joiningDate: now,
      status: 'active',
      synced: 1,
      lastUpdated: now,
    };
    await sqlite.upsertUserProfile(demoUser);

    const session = await sqlite.getUserProfileCombined('local_user');
    set({ user: session as UserSession, isDemoMode: true });
  },

  // Helper: setup default table values during setup wizard
  runCategoryOnboardingSetup: async (businessId: string, category: string, answers: Record<string, unknown>) => {
    try {
      if (category === 'restaurant') {
        const { initRestaurantSchema, createTable } = require('../services/restaurantDb');
        await initRestaurantSchema();
        const tablesCountVal = answers.tablesCount ? String(answers.tablesCount) : '6';
        const tablesCount = parseInt(tablesCountVal, 10);
        for (let i = 1; i <= tablesCount; i++) {
          await createTable(businessId, i.toString(), 4);
        }
      } else if (category === 'gym') {
        const { initGymTables, seedDefaultPlans } = require('../services/gymDb');
        await initGymTables();
        await seedDefaultPlans(businessId);
      } else if (category === 'tailor') {
        const { initTailorTables } = require('../services/tailorDb');
        await initTailorTables();
      } else if (category === 'pharmacy' || category === 'grocery') {
        const { initInventoryTables, seedSmartInventory } = require('../services/smartInventoryDb');
        await initInventoryTables();
        await seedSmartInventory(businessId);
      } else if (category === 'beauty_salon' || category === 'spa') {
        const { initSalonTables, seedDefaultServices } = require('../services/salonDb');
        await initSalonTables();
        await seedDefaultServices(businessId);
      }

      // Initialize and seed CRM tables globally for all businesses
      const { initCrmTables, seedCrmCustomers } = require('../services/crmDb');
      await initCrmTables();
      await seedCrmCustomers(businessId);
    } catch (err) {
      console.warn('[useAuthStore] Onboarding sub-setup failed:', err);
    }
  },

  // Internal helper to sync local profile
  loginLocalProfile: async (uid: string, email: string): Promise<UserSession> => {
    const profile = await sqlite.getUserProfileCombined(uid);
    if (profile) return profile as any;

    const now = new Date().toISOString();
    const businessId = 'biz_' + Math.random().toString(36).substring(2, 11);

    const defaultBiz: sqlite.BusinessProfile = {
      id: businessId,
      businessName: 'My Business',
      phone: '',
      address: '',
      logoUri: '',
      synced: 0,
      lastUpdated: now,
    };
    await sqlite.upsertBusinessProfile(defaultBiz);

    const defaultOwner: sqlite.UserProfile = {
      id: uid,
      businessId,
      role: 'owner',
      name: 'Business Owner',
      email,
      phone: '',
      salary: 0,
      joiningDate: now,
      status: 'active',
      synced: 0,
      lastUpdated: now,
    };
    await sqlite.upsertUserProfile(defaultOwner);

    return {
      id: uid,
      businessId,
      role: 'owner',
      name: 'Business Owner',
      email,
      phone: '',
      salary: 0,
      joiningDate: now,
      status: 'active',
      businessName: defaultBiz.businessName,
      address: defaultBiz.address,
      logoUri: defaultBiz.logoUri,
      lastUpdated: now,
    };
  }
}));
