import React, { createContext, useContext, useEffect } from 'react';
import { useAuthStore, UserSession } from '../store/useAuthStore';

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  isDemoMode: boolean;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const store = useAuthStore();

  useEffect(() => {
    store.initialize().catch(err => {
      console.error('[AuthProvider] Failed to initialize store session:', err);
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: store.user,
        loading: store.loading,
        isDemoMode: store.isDemoMode,
        login: store.login,
        signUp: store.signUp,
        updateProfile: store.updateProfile,
        logout: store.logout,
        forgotPassword: store.forgotPassword,
        resetPassword: store.resetPassword,
        resendVerificationEmail: store.resendVerificationEmail,
        verifyEmailOtp: store.verifyEmailOtp,
        loginWithPin: store.loginWithPin,
        setUserPin: store.setUserPin,
        getUserPin: store.getUserPin,
        switchToDemoMode: store.switchToDemoMode,
        switchToKitchenDemoMode: store.switchToKitchenDemoMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
