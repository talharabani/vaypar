import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { zodResolver } from '@hookform/resolvers/zod';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import * as z from 'zod';
import {
  BUSINESS_CATEGORIES,
  BusinessCategoryId,
  CATEGORY_GROUPS,
} from '../constants/businessCategories';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/use-theme';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { sendEmailOtp, verifyEmailOtpCode } from '../services/emailOtp';
import * as sqlite from '../services/sqlite';
import { LogoUploader } from './LogoUploader';

// ─── Storage Keys ────────────────────────────────────────────────────────────
const REMEMBER_EMAIL_KEY = 'vaypar_auth_saved_email';
const REMEMBER_FLAG_KEY = 'vaypar_auth_remember_flag';

// ─── International Country Codes ─────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: '+92', flag: '🇵🇰', name: 'Pakistan', placeholder: '300 1234567' },
  { code: '+1', flag: '🇺🇸', name: 'USA / Canada', placeholder: '(555) 234-5678' },
  { code: '+44', flag: '🇬🇧', name: 'UK', placeholder: '7911 123456' },
  { code: '+971', flag: '🇦🇪', name: 'UAE', placeholder: '50 123 4567' },
  { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia', placeholder: '50 123 4567' },
  { code: '+91', flag: '🇮🇳', name: 'India', placeholder: '98765 43210' },
  { code: '+49', flag: '🇩🇪', name: 'Germany', placeholder: '151 23456789' },
  { code: '+61', flag: '🇦🇺', name: 'Australia', placeholder: '412 345 678' },
  { code: '+', flag: '🌐', name: 'Global', placeholder: 'Phone with country code' },
];

// ─── Schemas with Strict Test Case Validations ────────────────────────────────
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const step1Schema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter (a-z)')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter (A-Z)')
    .regex(/[0-9]/, 'Must contain at least one number (0-9)')
    .regex(/[^A-Za-z0-9]/, 'Must contain at least one special symbol (!@#$%^&*)'),
  confirmPassword: z.string().min(1, 'Confirm password is required'),
  pin: z.string().regex(/^\d{4}$/, 'Quick PIN must be exactly 4 digits (e.g. 1234, 5678)'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

const step4Schema = z.object({
  businessName: z.string()
    .min(3, 'Business name must be at least 3 characters')
    .max(80, 'Business name is too long')
    .regex(/^[a-zA-Z0-9\s&'.,-]+$/, 'Business name contains invalid symbols'),
  phone: z.string()
    .min(7, 'Phone number must be at least 7 digits')
    .max(20, 'Phone number is too long')
    .regex(/^(\+)?[0-9\s\-()]{7,20}$/, 'Enter a valid international phone number (digits only)'),
  address: z.string()
    .min(8, 'Address must be at least 8 characters')
    .refine(
      (val) => {
        const trimmed = val.trim();
        const hasLetters = /[a-zA-Z]{3,}/.test(trimmed);
        const hasSeparation = /[\s,./#-]/.test(trimmed);
        const isNotRandomRun = !/^[0-9]+[a-zA-Z]+$/.test(trimmed) && !/^[a-zA-Z]+[0-9]+$/.test(trimmed);
        return hasLetters && hasSeparation && isNotRandomRun;
      },
      { message: 'Please enter a valid physical street address (e.g. Shop #12, Main Market, City / 100 Broadway, NY)' }
    ),
  logoUri: z.string().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;
type Step1Data = z.infer<typeof step1Schema>;
type Step4Data = z.infer<typeof step4Schema>;

// ─── Category images (Unsplash CDN) ──────────────────────────────────────────
const CAT_IMAGES: Record<string, string> = {
  restaurant:        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=480&q=75',
  cafe:              'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=480&q=75',
  dhaba:             'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=480&q=75',
  bakery:            'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=480&q=75',
  sweet_shop:        'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=480&q=75',
  juice_bar:         'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=480&q=75',
  coffee_shop:       'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=480&q=75',
  grocery:           'https://images.unsplash.com/photo-1542838132-92c53300491e?w=480&q=75',
  supermarket:       'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=480&q=75',
  pharmacy:          'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=480&q=75',
  medical_store:     'https://images.unsplash.com/photo-1563213126-a4273aed2016?w=480&q=75',
  clinic:            'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=480&q=75',
  clothing_boutique: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=480&q=75',
  tailor:            'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=480&q=75',
  shoe_store:        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=480&q=75',
  watch_shop:        'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=480&q=75',
  perfume_store:     'https://images.unsplash.com/photo-1541643600914-78b084683702?w=480&q=75',
  mobile_shop:       'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=480&q=75',
  mobile_repair:     'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=480&q=75',
  electronics_store: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=480&q=75',
  hardware_store:    'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=480&q=75',
  book_shop:         'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=480&q=75',
  stationery:        'https://images.unsplash.com/photo-1456735190827-d1262f71b8a3?w=480&q=75',
  pet_shop:          'https://images.unsplash.com/photo-1586671267731-da2cf3ceeb80?w=480&q=75',
  dairy:             'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=480&q=75',
  tyre_shop:         'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=480&q=75',
  auto_workshop:     'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=480&q=75',
  solar:             'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=480&q=75',
  real_estate:       'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=480&q=75',
  beauty_salon:      'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=480&q=75',
  spa:               'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=480&q=75',
  wedding_hall:      'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=480&q=75',
  event_management:  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=480&q=75',
  gym:               'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=480&q=75',
  fitness_center:    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=480&q=75',
  general:           'https://images.unsplash.com/photo-1444653614773-995cb1ef9efa?w=480&q=75',
};

const GROUP_HERO: Record<string, string> = {
  'Food & Beverage':     'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=80',
  'Retail':              'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=900&q=80',
  'Health & Medical':    'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=900&q=80',
  'Fashion & Personal':  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=80',
  'Mobile & Tech':       'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=900&q=80',
  'Auto & Industrial':   'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=900&q=80',
  'Real Estate':         'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=900&q=80',
  'Beauty & Wellness':   'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=900&q=80',
  'Events & Hospitality':'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=900&q=80',
  'Fitness & Health':    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=900&q=80',
  'Other':               'https://images.unsplash.com/photo-1444653614773-995cb1ef9efa?w=900&q=80',
};

// ─── Demo Profiles ────────────────────────────────────────────────────────────
const DEMO_PROFILES = [
  { role: 'Owner', icon: 'shield-checkmark', email: 'owner@vaypar.pk', pwd: 'Vault#Password99', desc: 'Full admin access' },
  { role: 'Manager', icon: 'business', email: 'manager@vaypar.pk', pwd: 'Vault#Password99', desc: 'Stock & staff' },
  { role: 'Cashier', icon: 'calculator', email: 'cashier@vaypar.pk', pwd: 'Vault#Password99', desc: 'POS register' },
  { role: 'Kitchen', icon: 'restaurant', email: 'kitchen@vaypar.pk', pwd: 'Vault#Password99', desc: 'Live KDS orders' },
];

// ─── Password Strength Evaluator ─────────────────────────────────────────────
interface PasswordScore {
  score: number; // 0 to 4
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  color: string;
  hasMinLength: boolean;
  hasNumber: boolean;
  hasLowercase: boolean;
  hasUppercase: boolean;
  hasSpecial: boolean;
}

function evaluatePasswordStrength(pwd: string): PasswordScore {
  const hasMinLength = pwd.length >= 8;
  const hasNumber = /[0-9]/.test(pwd);
  const hasLowercase = /[a-z]/.test(pwd);
  const hasUppercase = /[A-Z]/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

  let score = 0;
  if (hasMinLength) score += 1;
  if (hasLowercase && hasUppercase) score += 1;
  if (hasNumber) score += 1;
  if (hasSpecial && score >= 2) score += 1;

  if (score === 0) return { score: 0, label: 'Very Weak', color: '#8C8D94', hasMinLength, hasNumber, hasLowercase, hasUppercase, hasSpecial };
  if (score === 1) return { score: 1, label: 'Weak', color: '#FF4D4F', hasMinLength, hasNumber, hasLowercase, hasUppercase, hasSpecial };
  if (score === 2) return { score: 2, label: 'Fair', color: '#FA8C16', hasMinLength, hasNumber, hasLowercase, hasUppercase, hasSpecial };
  if (score === 3) return { score: 3, label: 'Good', color: '#1890FF', hasMinLength, hasNumber, hasLowercase, hasUppercase, hasSpecial };
  return { score: 4, label: 'Strong', color: '#22C55E', hasMinLength, hasNumber, hasLowercase, hasUppercase, hasSpecial };
}

// ─── Random Strong Password Generator ────────────────────────────────────────
function generateStrongPassword(): string {
  const words = ['Vault', 'Matrix', 'Nexus', 'Pulse', 'Hyper', 'Swift', 'Apex'];
  const specialChars = ['!', '@', '#', '$', '%', '&', '*'];
  const randomWord = words[Math.floor(Math.random() * words.length)];
  const randomNum = Math.floor(100 + Math.random() * 900);
  const randomSpecial = specialChars[Math.floor(Math.random() * specialChars.length)];
  const randomLower = 'abcdefghjkmnpqrstuvwxyz'[Math.floor(Math.random() * 23)];
  const randomUpper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)];
  return `${randomWord}${randomSpecial}${randomNum}${randomLower}${randomUpper}`;
}

// ─── AuthScreen Main Component ───────────────────────────────────────────────
export function AuthScreen() {
  const {
    login,
    signUp,
    forgotPassword,
    resetPassword,
    verifyEmailOtp,
    loginWithPin,
    switchToDemoMode,
    switchToKitchenDemoMode,
  } = useAuth();

  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && width >= 860;

  // Wizard state: 'login' | 'verify_email' | 'forgot' | 'pin' | 'setup_pin' | 'wizard'
  const [authView, setAuthView] = useState<'login' | 'verify_email' | 'forgot' | 'pin' | 'setup_pin' | 'wizard'>('login');
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [selectedCategory, setSelectedCategory] = useState<BusinessCategoryId>('restaurant');
  const [activeGroup, setActiveGroup] = useState(CATEGORY_GROUPS[0]);
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupTempData, setSignupTempData] = useState<Step1Data | null>(null);
  const [tablesCount, setTablesCount] = useState('6');
  const [enableTrials, setEnableTrials] = useState(true);
  const [stockThreshold, setStockThreshold] = useState('10');

  // Country code selector for phone
  const [selectedCountryCode, setSelectedCountryCode] = useState('+92');

  // Live Email Dispatch Notification Toast State
  const [emailNotification, setEmailNotification] = useState<{ email: string; code: string } | null>(null);

  // Unverified Email Verification Prompt State
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [unverifiedOtpCode, setUnverifiedOtpCode] = useState('');

  // Password interactive states
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Forgot Password Wizard States
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3 | 4>(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtpCode, setForgotOtpCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);

  // Quick 4-Digit PIN State
  const [enteredPin, setEnteredPin] = useState('');
  const [showPinDigits, setShowPinDigits] = useState(false);

  // Self-serve Setup PIN State
  const [setupPinEmail, setSetupPinEmail] = useState('');
  const [setupPinPassword, setSetupPinPassword] = useState('');
  const [setupPinNewCode, setSetupPinNewCode] = useState('');
  const [setupPinConfirmCode, setSetupPinConfirmCode] = useState('');

  // Form Controls
  const { control: loginControl, handleSubmit: handleLoginSubmit, setValue: setLoginValue, getValues: getLoginValues, formState: { errors: loginErrors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const { control: step1Control, handleSubmit: handleStep1Submit, watch: watchStep1, setValue: setStep1Value, formState: { errors: step1Errors } } = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: { email: '', password: '', confirmPassword: '', pin: '' },
  });

  const { control: step4Control, handleSubmit: handleStep4Submit, watch: watchStep4, setValue: setStep4Value, formState: { errors: step4Errors } } = useForm<Step4Data>({
    resolver: zodResolver(step4Schema),
    defaultValues: { businessName: '', phone: '', address: '', logoUri: '' },
  });

  const watchSignupPwd = watchStep1('password') || '';
  const watchSignupConfirm = watchStep1('confirmPassword') || '';
  const watchAddress = watchStep4('address') || '';

  // Load remembered email on mount
  useEffect(() => {
    (async () => {
      try {
        const savedEmail = await AsyncStorage.getItem(REMEMBER_EMAIL_KEY);
        const rememberFlag = await AsyncStorage.getItem(REMEMBER_FLAG_KEY);
        if (savedEmail && rememberFlag === 'true') {
          setLoginValue('email', savedEmail);
          setRememberMe(true);
        }
      } catch {}
    })();
  }, [setLoginValue]);

  // Handle countdown timer for OTP resend
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  // Left panel image
  const heroImg = CAT_IMAGES[selectedCategory] || GROUP_HERO[activeGroup] || GROUP_HERO['Food & Beverage'];

  // Handle Login with Strict Email Verification Enforcement
  const onLogin = async (data: LoginFormData) => {
    setError('');
    setInfoMessage('');
    setLoading(true);
    try {
      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_EMAIL_KEY, data.email.trim());
        await AsyncStorage.setItem(REMEMBER_FLAG_KEY, 'true');
      } else {
        await AsyncStorage.removeItem(REMEMBER_EMAIL_KEY);
        await AsyncStorage.setItem(REMEMBER_FLAG_KEY, 'false');
      }
      await login(data.email.trim(), data.password);
    } catch (e: any) {
      const msg = e.message || 'Login failed. Please verify email and password.';
      if (
        msg.toLowerCase().includes('not verified') ||
        msg.toLowerCase().includes('confirm') ||
        msg.toLowerCase().includes('not confirmed')
      ) {
        const targetEmail = data.email.trim();
        setUnverifiedEmail(targetEmail);
        setUnverifiedOtpCode('');
        setAuthView('verify_email');
        setResendCountdown(60);
        try {
          const result = await sendEmailOtp(targetEmail, 'login_verify');
          setEmailNotification({ email: targetEmail, code: result.code });
        } catch {}
        setInfoMessage(`Verification code sent to your login email: ${targetEmail}`);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Direct trigger to send verification code to the typed login email
  const handleVerifyCurrentEmail = async () => {
    const currentEmail = getLoginValues('email')?.trim();
    if (!currentEmail || !currentEmail.includes('@')) {
      setError('Please enter your email address in the box above first');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await sendEmailOtp(currentEmail, 'login_verify');
      setUnverifiedEmail(currentEmail);
      setUnverifiedOtpCode('');
      setAuthView('verify_email');
      setResendCountdown(60);
      setEmailNotification({ email: currentEmail, code: result.code });
      setInfoMessage(`Verification code dispatched to ${currentEmail}`);
    } catch (e: any) {
      setUnverifiedEmail(currentEmail);
      setUnverifiedOtpCode('');
      setAuthView('verify_email');
      setResendCountdown(60);
      setInfoMessage(`Enter verification code for ${currentEmail}`);
    } finally {
      setLoading(false);
    }
  };

  // Quick Demo Preset Login (pre-verified profiles)
  const handleQuickPresetLogin = async (preset: typeof DEMO_PROFILES[0]) => {
    setError('');
    setInfoMessage('');
    setLoginValue('email', preset.email);
    setLoginValue('password', preset.pwd);
    if (preset.role === 'Kitchen') {
      setLoading(true);
      try {
        await switchToKitchenDemoMode();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        await switchToDemoMode(selectedCategory);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // Handle 4-Digit PIN Submit
  const handlePinSubmit = async (pin: string) => {
    if (pin.length !== 4) return;
    setError('');
    setLoading(true);
    try {
      await loginWithPin(pin);
    } catch (e: any) {
      setError(e.message || 'Incorrect PIN. No account is configured with this 4-digit PIN. Please set your PIN in Settings or Sign Up.');
      setEnteredPin('');
    } finally {
      setLoading(false);
    }
  };

  // Handle PIN Pad Key Press
  const handlePinKeyPress = (num: string) => {
    if (enteredPin.length < 4) {
      const nextPin = enteredPin + num;
      setEnteredPin(nextPin);
      if (nextPin.length === 4) {
        handlePinSubmit(nextPin);
      }
    }
  };

  const handlePinDelete = () => {
    setEnteredPin(prev => prev.slice(0, -1));
  };

  // Physical Keyboard listener for PIN entry (Web ATM experience)
  useEffect(() => {
    if (Platform.OS !== 'web' || authView !== 'pin') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside a real text input
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        setEnteredPin(prev => {
          if (prev.length < 4) {
            const next = prev + e.key;
            if (next.length === 4) {
              handlePinSubmit(next);
            }
            return next;
          }
          return prev;
        });
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setEnteredPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Escape' || e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setEnteredPin('');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (enteredPin.length === 4) {
          handlePinSubmit(enteredPin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authView, enteredPin]);

  // Handle Self-Serve User PIN Setup & Activation
  const handleSaveUserPin = async () => {
    if (!setupPinEmail || !setupPinEmail.includes('@')) {
      setError('Please enter your registered account email');
      return;
    }
    if (!setupPinPassword) {
      setError('Please enter your account password to verify ownership');
      return;
    }
    if (!/^\d{4}$/.test(setupPinNewCode)) {
      setError('Quick PIN must be exactly 4 digits (e.g. 2468)');
      return;
    }
    if (setupPinNewCode !== setupPinConfirmCode) {
      setError('PIN confirmation does not match');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const all = await sqlite.getAllUserProfiles();
      const existingUser = all.find(u => u.email && u.email.toLowerCase() === setupPinEmail.trim().toLowerCase());
      const targetUid = existingUser ? existingUser.id : ('local_' + setupPinEmail.trim().replace(/[^a-zA-Z0-9]/g, '_'));

      // Save custom PIN in SQLite for this user
      await sqlite.setUserPin(targetUid, setupPinNewCode);
      await sqlite.setUserPin(setupPinEmail.trim().toLowerCase(), setupPinNewCode);

      setInfoMessage(`PIN ${setupPinNewCode} successfully configured for ${setupPinEmail}! Enter it below to unlock.`);
      setEnteredPin(setupPinNewCode);
      setAuthView('pin');
    } catch (e: any) {
      setError(e.message || 'Failed to save custom PIN');
    } finally {
      setLoading(false);
    }
  };

  // Password Generator Handler for Sign-Up
  const handleGeneratePassword = () => {
    const generated = generateStrongPassword();
    setStep1Value('password', generated);
    setStep1Value('confirmPassword', generated);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(generated);
    }
    setInfoMessage(`Generated strong password: ${generated} (Copied to clipboard)`);
  };

  // Handle Forgot Password Flow
  const handleForgotSendCode = async () => {
    if (!forgotEmail || !forgotEmail.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await sendEmailOtp(forgotEmail.trim(), 'password_reset');
      setEmailNotification({ email: forgotEmail.trim(), code: result.code });
      setForgotStep(2);
      setResendCountdown(60);
      setInfoMessage(`Password reset verification code dispatched to ${forgotEmail.trim()}`);
    } catch (e: any) {
      setError(e.message || 'Could not send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotVerifyOtp = async () => {
    if (forgotOtpCode.length < 6) {
      setError('Enter a complete 6-digit verification code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const check = await verifyEmailOtpCode(forgotEmail.trim(), forgotOtpCode);
      if (!check.valid) {
        setError(check.message || 'Invalid verification code');
        return;
      }
      setForgotStep(3);
    } catch (e: any) {
      setError(e.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSaveNewPassword = async () => {
    const strength = evaluatePasswordStrength(forgotNewPassword);
    if (!strength.hasMinLength || !strength.hasLowercase || !strength.hasUppercase || !strength.hasNumber || !strength.hasSpecial) {
      setError('Password must satisfy all test cases: lowercase, uppercase, number, symbol & 8+ length');
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPassword(forgotEmail.trim(), forgotNewPassword, forgotOtpCode.trim());
      setForgotStep(4);
    } catch (e: any) {
      setError(e.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  // Handle Sign-Up Step 1 Next (Creates Supabase user & sends verification email)
  const onStep1Next = async (data: Step1Data) => {
    setError('');
    setSignupTempData(data);
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const { data: suData, error: suErr } = await supabase.auth.signUp({
          email: data.email.trim(),
          password: data.password,
        });
        if (suErr) {
          if (suErr.message.toLowerCase().includes('already registered')) {
            throw new Error('This email is already registered. Please sign in instead.');
          }
          if (suErr.message.toLowerCase().includes('rate limit')) {
            throw new Error('Supabase email limit exceeded (max 3 emails/hour on free tier). Please check your Spam/Junk folder or wait before retrying.');
          }
          throw suErr;
        }

        // Supabase returns empty identities array if user was already registered
        if (suData?.user && suData.user.identities && suData.user.identities.length === 0) {
          throw new Error('This email is already registered in Supabase. Please sign in instead or use Forgot Password.');
        }

        // If email confirmation is disabled in Supabase, proceed directly to Step 3
        const isAutoConfirmed = !!(
          suData?.user?.email_confirmed_at ||
          (suData?.user as any)?.confirmed_at ||
          suData?.session
        );

        if (isAutoConfirmed) {
          setWizardStep(3);
          setInfoMessage('Account created successfully! Choose your industry category to continue.');
          return;
        }
      } else {
        const result = await sendEmailOtp(data.email.trim(), 'signup');
        setEmailNotification({ email: data.email.trim(), code: result.code });
      }

      setResendCountdown(60);
      setOtpCode('');
      setWizardStep(2);
      setInfoMessage(`Verification email dispatched to ${data.email.trim()}. Please check your inbox and Spam/Junk folder.`);
    } catch (e: any) {
      setError(e.message || 'Could not initiate email verification.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    setError('');
    if (!signupTempData) return;
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const cleanEmail = signupTempData.email.trim();
        const cleanToken = otpCode.trim();
        const { data: vData, error: vErr } = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanToken,
          type: 'signup',
        });
        let ok = !vErr && !!vData?.user;
        if (!ok) {
          const { data: vData2, error: vErr2 } = await supabase.auth.verifyOtp({
            email: cleanEmail,
            token: cleanToken,
            type: 'email',
          });
          ok = !vErr2 && !!vData2?.user;
        }
        if (!ok) {
          throw new Error('Invalid 6-digit code. Please check your email inbox and try again.');
        }
      } else {
        const check = await verifyEmailOtpCode(signupTempData.email.trim(), otpCode.trim());
        if (!check.valid) {
          setError(check.message || 'Invalid 6-digit code. Please enter the code sent to your email.');
          return;
        }
      }
      setEmailNotification(null);
      setWizardStep(3);
    } catch (e: any) {
      setError(e.message || 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleWizardFinish = async (profileData: Step4Data) => {
    if (!signupTempData) return;
    setLoading(true);
    try {
      // Format full phone with selected country code if needed
      const rawPhone = profileData.phone.trim();
      const finalPhone = rawPhone.startsWith('+') ? rawPhone : `${selectedCountryCode} ${rawPhone}`;

      await signUp(
        signupTempData.email,
        signupTempData.password,
        profileData.businessName,
        finalPhone,
        profileData.address,
        profileData.logoUri,
        selectedCategory,
        { tablesCount, enableTrials, stockThreshold, pin: signupTempData.pin }
      );
    } catch (e: any) {
      const msg = e.message || '';
      if (
        msg.includes('VERIFICATION_REQUIRED') ||
        msg.toLowerCase().includes('verification link sent') ||
        msg.toLowerCase().includes('confirm')
      ) {
        const targetEmail = signupTempData.email.trim();
        setUnverifiedEmail(targetEmail);
        setUnverifiedOtpCode('');
        setAuthView('verify_email');
        setResendCountdown(60);
        setInfoMessage(`Verification email sent to ${targetEmail}. Please check your inbox and verify your email to activate your account.`);
      } else {
        setError(msg || 'Setup failed.');
        setWizardStep(5);
      }
    } finally {
      setLoading(false);
    }
  };

  const selectedCat = BUSINESS_CATEGORIES.find(c => c.id === selectedCategory);
  const selectedCountry = COUNTRY_CODES.find(c => c.code === selectedCountryCode) || COUNTRY_CODES[0];

  return (
    <View style={styles.root}>

        {/* ── Left Hero Panel (Vault Obsidian Theme) ── */}
        {isWide && (
          <View style={styles.leftPanel}>
            <Image source={{ uri: heroImg }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
            <View style={styles.heroDim} />
            <View style={styles.heroOverlayGradient} />
            <View style={styles.heroContent}>
              <View style={styles.heroBrandRow}>
                <View style={styles.heroLogoIcon}>
                  <Ionicons name="sparkles" size={18} color="#16171B" />
                </View>
                <Text style={styles.heroBrandText}>VAYPAR</Text>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>Retail & POS Workspace</Text>
                </View>
              </View>

              <Text style={styles.heroTitle}>Smart Business Automation</Text>
              <Text style={styles.heroTagline}>
                Empower your inventory, sales, billing, and team roles with high-speed, secure intelligence.
              </Text>

              {/* Security Pill Card */}
              <View style={styles.securityHighlightCard}>
                <View style={styles.securityIconBox}>
                  <Ionicons name="shield-checkmark" size={20} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.securityTitle}>Multi-Country & Verified Security</Text>
                  <Text style={styles.securitySub}>
                    Global phone codes, strict address validation, high-entropy password test cases, and real-time OTPs.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── Right Form Panel ── */}
        <KeyboardAvoidingView style={styles.rightPanel} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={[styles.scroll, !isWide && { paddingHorizontal: 20 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Mobile Header */}
            {!isWide && (
              <View style={styles.mobileBrand}>
                <View style={[styles.brandDot, { backgroundColor: '#C5A880' }]}>
                  <Ionicons name="sparkles" size={20} color="#16171B" />
                </View>
                <View>
                  <Text style={[styles.brandName, { color: theme.text }]}>Vaypar POS</Text>
                  <Text style={[styles.brandSub, { color: '#8C8D94' }]}>WORKSPACE</Text>
                </View>
              </View>
            )}

            {/* Step Wizard Progress Bar (Only during signup steps 1-6) */}
            {authView === 'wizard' && (
              <View style={styles.stepRow}>
                {([1, 2, 3, 4, 5, 6] as const).map(n => (
                  <View
                    key={n}
                    style={[
                      styles.stepDot,
                      {
                        backgroundColor: n === wizardStep ? '#C5A880' : n < wizardStep ? '#1A1A1A' : '#E4E6EB',
                        width: n === wizardStep ? 28 : 8,
                      },
                    ]}
                  />
                ))}
                <Text style={[styles.stepLabel, { color: theme.textSecondary }]}>
                  Step {wizardStep} of 6
                </Text>
              </View>
            )}

            {/* ── Simulated Email Dispatch Toast (Local / Offline Demo Only) ── */}
            {!isSupabaseConfigured() && emailNotification && (
              <View style={styles.emailToastCard}>
                <View style={styles.emailToastHeader}>
                  <View style={styles.emailToastIconBox}>
                    <Ionicons name="mail" size={15} color="#16171B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.emailToastSender}>Vault Mail Delivery Service</Text>
                    <Text style={styles.emailToastRecipient} numberOfLines={1}>
                      To: <Text style={{ fontWeight: '800' }}>{emailNotification.email}</Text>
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setEmailNotification(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={16} color="#8C8D94" />
                  </TouchableOpacity>
                </View>

                <View style={styles.emailToastBody}>
                  <Text style={styles.emailToastSubject}>Your 6-Digit Email Verification Code:</Text>
                  <View style={styles.emailOtpCodeBox}>
                    <Text style={styles.emailOtpCodeText}>{emailNotification.code.split('').join('  ')}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.autoFillButton}
                    onPress={() => {
                      if (authView === 'wizard' && wizardStep === 2) {
                        setOtpCode(emailNotification.code);
                      } else if (authView === 'verify_email') {
                        setUnverifiedOtpCode(emailNotification.code);
                      } else if (authView === 'forgot' && forgotStep === 2) {
                        setForgotOtpCode(emailNotification.code);
                      }
                      setEmailNotification(null);
                    }}
                  >
                    <Ionicons name="flash" size={13} color="#16171B" />
                    <Text style={styles.autoFillButtonText}>Auto-Fill Code (1-Tap)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Error Banner */}
            {!!error && (
              <View style={[styles.alertBanner, { backgroundColor: '#FFF1F0', borderColor: '#FFA39E' }]}>
                <Ionicons name="alert-circle" size={18} color="#CF1322" />
                <Text style={[styles.alertText, { color: '#CF1322' }]}>{error}</Text>
                <TouchableOpacity onPress={() => setError('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={16} color="#CF1322" />
                </TouchableOpacity>
              </View>
            )}

            {/* Info Message Banner */}
            {!!infoMessage && (
              <View style={[styles.alertBanner, { backgroundColor: '#F6FFED', borderColor: '#B7EB8F' }]}>
                <Ionicons name="checkmark-circle" size={18} color="#389E0D" />
                <Text style={[styles.alertText, { color: '#389E0D' }]}>{infoMessage}</Text>
                <TouchableOpacity onPress={() => setInfoMessage('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={16} color="#389E0D" />
                </TouchableOpacity>
              </View>
            )}

            {/* Caps Lock Warning */}
            {capsLockActive && (
              <View style={styles.capsLockBadge}>
                <Ionicons name="warning" size={14} color="#D48806" />
                <Text style={styles.capsLockText}>Caps Lock is ON</Text>
              </View>
            )}

            {/* ════════════════════════════════════════════════════════════════
                VIEW 1: SIGN IN (PASSWORD & PIN MODES)
            ════════════════════════════════════════════════════════════════ */}
            {authView === 'login' && (
              <View>
                {/* Verified Email Security Pill */}
                <View style={styles.verifiedNoticePill}>
                  <Ionicons name="shield-checkmark" size={13} color="#16171B" />
                  <Text style={styles.verifiedNoticeText}>Only Verified Accounts Can Sign In</Text>
                </View>

                {/* Header */}
                <View style={{ marginBottom: 18 }}>
                  <Text style={[styles.h1, { color: theme.text }]}>Welcome Back</Text>
                  <Text style={[styles.sub, { color: theme.textSecondary }]}>
                    Sign into your verified business workspace.
                  </Text>
                </View>

                {/* Login Method Segment Tabs */}
                <View style={styles.tabBar}>
                  <TouchableOpacity
                    style={[styles.tabButton, styles.tabButtonActive]}
                    onPress={() => setAuthView('login')}
                  >
                    <Ionicons name="key-outline" size={16} color="#16171B" />
                    <Text style={styles.tabTextActive}>Password Login</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.tabButton}
                    onPress={() => { setAuthView('pin'); setEnteredPin(''); setError(''); }}
                  >
                    <Ionicons name="grid-outline" size={16} color={theme.textSecondary} />
                    <Text style={[styles.tabText, { color: theme.textSecondary }]}>Quick PIN Code</Text>
                  </TouchableOpacity>
                </View>

                {/* Email Input */}
                <StyledInputField
                  control={loginControl}
                  name="email"
                  icon="mail-outline"
                  label="Verified Email Address"
                  placeholder="admin@business.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  error={loginErrors.email?.message}
                  theme={theme}
                />

                {/* Password Input with Visibility and CapsLock detection */}
                <StyledInputField
                  control={loginControl}
                  name="password"
                  icon="lock-closed-outline"
                  label="Password"
                  placeholder="Enter your password"
                  secureTextEntry={!showLoginPassword}
                  error={loginErrors.password?.message}
                  theme={theme}
                  rightIcon={showLoginPassword ? 'eye-off-outline' : 'eye-outline'}
                  onRightIcon={() => setShowLoginPassword(v => !v)}
                  onKeyPress={(e: any) => {
                    if (Platform.OS === 'web' && e?.getModifierState) {
                      setCapsLockActive(e.getModifierState('CapsLock'));
                    }
                  }}
                />

                {/* Remember Me & Options Row */}
                <View style={styles.optionsRow}>
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    activeOpacity={0.8}
                    onPress={() => setRememberMe(v => !v)}
                  >
                    <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                      {rememberMe && <Ionicons name="checkmark" size={12} color="#16171B" />}
                    </View>
                    <Text style={[styles.checkboxLabel, { color: theme.text }]}>Remember me</Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <TouchableOpacity onPress={handleVerifyCurrentEmail}>
                      <Text style={[styles.forgotLink, { color: '#0958D9' }]}>Verify Email</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        setAuthView('forgot');
                        setForgotStep(1);
                        setError('');
                        setInfoMessage('');
                      }}
                    >
                      <Text style={styles.forgotLink}>Forgot Password?</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Sign In Primary Button */}
                <PrimaryButton
                  label="Sign In to Verified Account"
                  icon="log-in-outline"
                  loading={loading}
                  onPress={handleLoginSubmit(onLogin)}
                  theme={theme}
                />

                {/* Divider */}
                <View style={styles.divRow}>
                  <View style={[styles.divLine, { backgroundColor: theme.border }]} />
                  <Text style={[styles.divTxt, { color: theme.textSecondary }]}>New to Vaypar?</Text>
                  <View style={[styles.divLine, { backgroundColor: theme.border }]} />
                </View>

                {/* Create Account Switch */}
                <TouchableOpacity
                  style={[styles.createAccountBtn, { borderColor: theme.border }]}
                  onPress={() => { setAuthView('wizard'); setWizardStep(1); setError(''); }}
                >
                  <Ionicons name="storefront-outline" size={18} color="#16171B" />
                  <Text style={styles.createAccountBtnText}>Create New Business Workspace</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ════════════════════════════════════════════════════════════════
                VIEW 2: UNVERIFIED EMAIL PROMPT (VERIFY & SIGN IN)
            ════════════════════════════════════════════════════════════════ */}
            {authView === 'verify_email' && (
              <View>
                <View style={styles.unverifiedBannerBox}>
                  <Ionicons name="mail-unread-outline" size={24} color="#16171B" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.unverifiedBannerTitle}>Verify Your Email</Text>
                    <Text style={styles.unverifiedBannerSub}>
                      A confirmation email has been sent to your inbox. You can click the verification link in your email, or enter the 6-digit code below:
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#C5A880' }}>
                      <Ionicons name="mail" size={14} color="#16171B" />
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#16171B' }}>{unverifiedEmail || 'your email'}</Text>
                    </View>
                  </View>
                </View>

                <OtpInput
                  value={unverifiedOtpCode}
                  onChange={setUnverifiedOtpCode}
                  theme={theme}
                />

                <View style={styles.resendRow}>
                  {resendCountdown > 0 ? (
                    <Text style={[styles.resendTimerText, { color: theme.textSecondary }]}>
                      Resend code to {unverifiedEmail} in {resendCountdown}s
                    </Text>
                  ) : (
                    <TouchableOpacity
                      onPress={async () => {
                        setLoading(true);
                        try {
                          const result = await sendEmailOtp(unverifiedEmail, 'login_verify');
                          if (!isSupabaseConfigured()) {
                            setEmailNotification({ email: unverifiedEmail, code: result.code });
                          }
                          setResendCountdown(60);
                          setInfoMessage(`Fresh verification email sent to ${unverifiedEmail}`);
                        } catch (e: any) {
                          setError(e.message || 'Could not resend verification email');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                    >
                      <Text style={styles.resendActionText}>Resend Verification to {unverifiedEmail}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <PrimaryButton
                  label="Verify Code & Launch Workspace"
                  icon="shield-checkmark-outline"
                  loading={loading}
                  disabled={unverifiedOtpCode.length < 6}
                  onPress={async () => {
                    setError('');
                    setLoading(true);
                    try {
                      const check = await verifyEmailOtpCode(unverifiedEmail, unverifiedOtpCode);
                      if (!check.valid) {
                        setError(check.message || 'Invalid 6-digit verification code. Please check and try again.');
                        return;
                      }
                      await verifyEmailOtp(unverifiedEmail, unverifiedOtpCode);
                      setInfoMessage('Email verified successfully! Workspace activated.');
                    } catch (e: any) {
                      setError(e.message || 'Invalid verification code. Please check and try again.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  theme={theme}
                />

                <TouchableOpacity
                  style={{
                    marginTop: 12,
                    paddingVertical: 13,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#C5A880',
                    backgroundColor: '#FBF9F5',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                  }}
                  onPress={() => {
                    setAuthView('login');
                    setError('');
                    setInfoMessage('If you confirmed via email link, please sign in with your email and password.');
                  }}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#16171B" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#16171B' }}>
                    I Verified via Email Link → Sign In
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backToLoginBtn}
                  onPress={() => {
                    setAuthView('login');
                    setError('');
                    setInfoMessage('');
                  }}
                >
                  <Ionicons name="arrow-back" size={14} color={theme.textSecondary} />
                  <Text style={[styles.backToLoginText, { color: theme.textSecondary }]}>Back to Sign In</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ════════════════════════════════════════════════════════════════
                VIEW 3: QUICK 4-DIGIT PIN MODE (ATM / POS COUNTER KEYPAD)
            ════════════════════════════════════════════════════════════════ */}
            {authView === 'pin' && (
              <View>
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[styles.h1, { color: theme.text }]}>Terminal Quick PIN</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(34, 197, 94, 0.12)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' }} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803D' }}>POS Online</Text>
                    </View>
                  </View>
                  <Text style={[styles.sub, { color: theme.textSecondary, marginTop: 4 }]}>
                    Enter your configured 4-digit security PIN on the ATM keypad or keyboard.
                  </Text>
                </View>

                {/* Tab switcher */}
                <View style={styles.tabBar}>
                  <TouchableOpacity
                    style={styles.tabButton}
                    onPress={() => setAuthView('login')}
                  >
                    <Ionicons name="key-outline" size={16} color={theme.textSecondary} />
                    <Text style={[styles.tabText, { color: theme.textSecondary }]}>Password Login</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tabButton, styles.tabButtonActive]}
                    onPress={() => setAuthView('pin')}
                  >
                    <Ionicons name="grid-outline" size={16} color="#16171B" />
                    <Text style={styles.tabTextActive}>ATM PIN Keypad</Text>
                  </TouchableOpacity>
                </View>

                {/* ATM PIN Display Screen */}
                <View style={[styles.atmDisplayCard, { borderColor: enteredPin.length === 4 ? '#22C55E' : '#E5E7EB' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
                    <Text style={[styles.pinDisplayTitle, { color: theme.textSecondary, marginBottom: 0 }]}>
                      ENTER 4-DIGIT SECURITY PIN
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowPinDigits(!showPinDigits)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2 }}
                    >
                      <Ionicons name={showPinDigits ? 'eye-off-outline' : 'eye-outline'} size={15} color={theme.textSecondary} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textSecondary }}>
                        {showPinDigits ? 'Hide' : 'Show'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* 4 Distinct ATM Boxes */}
                  <View style={styles.atmSlotsRow}>
                    {[0, 1, 2, 3].map(index => {
                      const isFilled = enteredPin.length > index;
                      const isCurrent = enteredPin.length === index;
                      const digit = enteredPin[index];

                      return (
                        <View
                          key={index}
                          style={[
                            styles.atmSlot,
                            isFilled && styles.atmSlotFilled,
                            isCurrent && styles.atmSlotActive,
                          ]}
                        >
                          {isFilled ? (
                            showPinDigits ? (
                              <Text style={styles.atmSlotDigit}>{digit}</Text>
                            ) : (
                              <View style={styles.atmSlotBullet} />
                            )
                          ) : (
                            isCurrent && <View style={styles.atmCursorBar} />
                          )}
                        </View>
                      );
                    })}
                  </View>

                  <Text style={[styles.pinHint, { marginTop: 10, color: theme.textSecondary }]}>
                    Use computer keypad or click buttons below
                  </Text>
                </View>

                {/* ATM Keypad Grid */}
                <View style={styles.atmKeypadGrid}>
                  {[
                    { key: '1', sub: '' },
                    { key: '2', sub: 'ABC' },
                    { key: '3', sub: 'DEF' },
                    { key: '4', sub: 'GHI' },
                    { key: '5', sub: 'JKL' },
                    { key: '6', sub: 'MNO' },
                    { key: '7', sub: 'PQRS' },
                    { key: '8', sub: 'TUV' },
                    { key: '9', sub: 'WXYZ' },
                    { key: 'CANCEL', sub: 'CLEAR', action: 'cancel' },
                    { key: '0', sub: '+' },
                    { key: 'DEL', sub: 'BACK', action: 'delete' },
                  ].map(item => (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.atmKey,
                        item.action === 'cancel' && styles.atmKeyCancel,
                        item.action === 'delete' && styles.atmKeyDelete,
                      ]}
                      onPress={() => {
                        if (item.action === 'cancel') setEnteredPin('');
                        else if (item.action === 'delete') handlePinDelete();
                        else handlePinKeyPress(item.key);
                      }}
                      disabled={loading}
                      activeOpacity={0.65}
                    >
                      {item.action === 'cancel' ? (
                        <View style={{ alignItems: 'center' }}>
                          <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#EF4444', marginTop: 1 }}>CANCEL</Text>
                        </View>
                      ) : item.action === 'delete' ? (
                        <View style={{ alignItems: 'center' }}>
                          <Ionicons name="backspace-outline" size={20} color="#16171B" />
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#16171B', marginTop: 1 }}>DELETE</Text>
                        </View>
                      ) : (
                        <View style={{ alignItems: 'center' }}>
                          <Text style={[styles.atmKeyNumber, { color: theme.text }]}>{item.key}</Text>
                          {item.sub ? (
                            <Text style={styles.atmKeyLetters}>{item.sub}</Text>
                          ) : null}
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                {loading && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                    <ActivityIndicator size="small" color="#16171B" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#16171B' }}>Verifying terminal credentials...</Text>
                  </View>
                )}

                {/* Direct PIN Setup Button */}
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    marginTop: 14,
                    paddingVertical: 9,
                    paddingHorizontal: 14,
                    backgroundColor: '#F3F4F6',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                  }}
                  onPress={() => {
                    setError('');
                    setInfoMessage('');
                    setAuthView('setup_pin');
                  }}
                >
                  <Ionicons name="keypad-outline" size={15} color="#16171B" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#16171B' }}>
                    First time or forgot PIN? Set Up / Change PIN
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backToLoginBtn}
                  onPress={() => setAuthView('login')}
                >
                  <Ionicons name="arrow-back" size={14} color={theme.textSecondary} />
                  <Text style={[styles.backToLoginText, { color: theme.textSecondary }]}>Back to Email Sign In</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ════════════════════════════════════════════════════════════════
                VIEW 3.5: SELF-SERVE SET UP / CHANGE 4-DIGIT QUICK PIN
            ════════════════════════════════════════════════════════════════ */}
            {authView === 'setup_pin' && (
              <View>
                <View style={{ marginBottom: 18 }}>
                  <Text style={[styles.h1, { color: theme.text }]}>Set Up Quick PIN</Text>
                  <Text style={[styles.sub, { color: theme.textSecondary }]}>
                    Link your personal 4-digit PIN to your email for instant ATM & POS terminal login.
                  </Text>
                </View>

                {/* Email */}
                <View style={{ marginBottom: 14 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Account Email</Text>
                  <View style={[styles.inputRow, { borderColor: theme.border }]}>
                    <Ionicons name="mail-outline" size={16} color={theme.textSecondary} style={{ marginRight: 10 }} />
                    <TextInput
                      placeholder="admin@mybusiness.com"
                      placeholderTextColor={theme.textSecondary + '70'}
                      value={setupPinEmail}
                      onChangeText={setSetupPinEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={[styles.inputTxt, { color: theme.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                    />
                  </View>
                </View>

                {/* Password to Verify */}
                <View style={{ marginBottom: 14 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Account Password</Text>
                  <View style={[styles.inputRow, { borderColor: theme.border }]}>
                    <Ionicons name="lock-closed-outline" size={16} color={theme.textSecondary} style={{ marginRight: 10 }} />
                    <TextInput
                      placeholder="Enter your password to verify"
                      placeholderTextColor={theme.textSecondary + '70'}
                      value={setupPinPassword}
                      onChangeText={setSetupPinPassword}
                      secureTextEntry
                      style={[styles.inputTxt, { color: theme.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                    />
                  </View>
                </View>

                {/* New 4-Digit PIN */}
                <View style={{ marginBottom: 14 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>New 4-Digit PIN</Text>
                  <View style={[styles.inputRow, { borderColor: theme.border }]}>
                    <Ionicons name="grid-outline" size={16} color={theme.textSecondary} style={{ marginRight: 10 }} />
                    <TextInput
                      placeholder="e.g. 5678"
                      placeholderTextColor={theme.textSecondary + '70'}
                      value={setupPinNewCode}
                      onChangeText={v => setSetupPinNewCode(v.replace(/[^0-9]/g, '').slice(0, 4))}
                      keyboardType="numeric"
                      maxLength={4}
                      style={[styles.inputTxt, { color: theme.text, fontSize: 18, fontWeight: '800', letterSpacing: 4 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                    />
                  </View>
                </View>

                {/* Confirm 4-Digit PIN */}
                <View style={{ marginBottom: 18 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Confirm 4-Digit PIN</Text>
                  <View style={[styles.inputRow, { borderColor: theme.border }]}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={theme.textSecondary} style={{ marginRight: 10 }} />
                    <TextInput
                      placeholder="e.g. 5678"
                      placeholderTextColor={theme.textSecondary + '70'}
                      value={setupPinConfirmCode}
                      onChangeText={v => setSetupPinConfirmCode(v.replace(/[^0-9]/g, '').slice(0, 4))}
                      keyboardType="numeric"
                      maxLength={4}
                      style={[styles.inputTxt, { color: theme.text, fontSize: 18, fontWeight: '800', letterSpacing: 4 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                    />
                  </View>
                </View>

                <PrimaryButton
                  label="Save & Activate PIN"
                  icon="checkmark-circle-outline"
                  loading={loading}
                  onPress={handleSaveUserPin}
                  theme={theme}
                />

                <TouchableOpacity
                  style={styles.backToLoginBtn}
                  onPress={() => {
                    setError('');
                    setInfoMessage('');
                    setAuthView('pin');
                  }}
                >
                  <Ionicons name="arrow-back" size={14} color={theme.textSecondary} />
                  <Text style={[styles.backToLoginText, { color: theme.textSecondary }]}>Back to PIN Keypad</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ════════════════════════════════════════════════════════════════
                VIEW 4: FORGOT / RESET PASSWORD WORKFLOW
            ════════════════════════════════════════════════════════════════ */}
            {authView === 'forgot' && (
              <View>
                {/* Step 1: Request Reset Code */}
                {forgotStep === 1 && (
                  <View>
                    <View style={{ marginBottom: 20 }}>
                      <Text style={[styles.h1, { color: theme.text }]}>Reset Password</Text>
                      <Text style={[styles.sub, { color: theme.textSecondary }]}>
                        Enter your registered account email and we'll send a 6-digit verification code.
                      </Text>
                    </View>

                    <View style={{ marginBottom: 16 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Registered Email</Text>
                      <View style={[styles.inputRow, { borderColor: theme.border }]}>
                        <Ionicons name="mail-outline" size={16} color={theme.textSecondary} style={{ marginRight: 10 }} />
                        <TextInput
                          placeholder="admin@business.com"
                          placeholderTextColor={theme.textSecondary + '70'}
                          value={forgotEmail}
                          onChangeText={setForgotEmail}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          style={[styles.inputTxt, { color: theme.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                        />
                      </View>
                    </View>

                    <PrimaryButton
                      label="Send Reset Code"
                      icon="paper-plane-outline"
                      loading={loading}
                      onPress={handleForgotSendCode}
                      theme={theme}
                    />

                    <TouchableOpacity style={styles.backToLoginBtn} onPress={() => setAuthView('login')}>
                      <Ionicons name="arrow-back" size={14} color={theme.textSecondary} />
                      <Text style={[styles.backToLoginText, { color: theme.textSecondary }]}>Back to Sign In</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Step 2: Verify OTP */}
                {forgotStep === 2 && (
                  <View>
                    <View style={{ marginBottom: 20 }}>
                      <Text style={[styles.h1, { color: theme.text }]}>Verify Code</Text>
                      <Text style={[styles.sub, { color: theme.textSecondary }]}>
                        Enter the 6-digit recovery code sent to <Text style={{ fontWeight: '700' }}>{forgotEmail}</Text>
                      </Text>
                    </View>

                    <OtpInput
                      value={forgotOtpCode}
                      onChange={setForgotOtpCode}
                      theme={theme}
                    />

                    <View style={styles.resendRow}>
                      {resendCountdown > 0 ? (
                        <Text style={[styles.resendTimerText, { color: theme.textSecondary }]}>
                          Resend code in {resendCountdown}s
                        </Text>
                      ) : (
                        <TouchableOpacity onPress={handleForgotSendCode} disabled={loading}>
                          <Text style={styles.resendActionText}>Resend Code</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <PrimaryButton
                      label="Verify & Continue"
                      icon="arrow-forward-outline"
                      disabled={forgotOtpCode.length < 6}
                      loading={loading}
                      onPress={handleForgotVerifyOtp}
                      theme={theme}
                    />

                    <TouchableOpacity style={styles.backToLoginBtn} onPress={() => setForgotStep(1)}>
                      <Ionicons name="arrow-back" size={14} color={theme.textSecondary} />
                      <Text style={[styles.backToLoginText, { color: theme.textSecondary }]}>Change Email</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Step 3: Set New Password */}
                {forgotStep === 3 && (
                  <View>
                    <View style={{ marginBottom: 20 }}>
                      <Text style={[styles.h1, { color: theme.text }]}>Create New Password</Text>
                      <Text style={[styles.sub, { color: theme.textSecondary }]}>
                        Password must pass all test cases: uppercase, lowercase, numbers & special symbols.
                      </Text>
                    </View>

                    {/* New Password */}
                    <View style={{ marginBottom: 14 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>New Password</Text>
                      <View style={[styles.inputRow, { borderColor: theme.border }]}>
                        <Ionicons name="lock-closed-outline" size={16} color={theme.textSecondary} style={{ marginRight: 10 }} />
                        <TextInput
                          placeholder="Enter new strong password"
                          placeholderTextColor={theme.textSecondary + '70'}
                          value={forgotNewPassword}
                          onChangeText={setForgotNewPassword}
                          secureTextEntry={!showResetNewPassword}
                          style={[styles.inputTxt, { color: theme.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                        />
                        <TouchableOpacity
                          onPress={() => setShowResetNewPassword(v => !v)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons
                            name={showResetNewPassword ? 'eye-off-outline' : 'eye-outline'}
                            size={16}
                            color={theme.textSecondary}
                          />
                        </TouchableOpacity>
                      </View>
                      {/* Password Test Cases Checklist */}
                      <PasswordStrengthBar password={forgotNewPassword} />
                    </View>

                    {/* Confirm New Password */}
                    <View style={{ marginBottom: 14 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Confirm New Password</Text>
                      <View style={[styles.inputRow, { borderColor: theme.border }]}>
                        <Ionicons name="shield-checkmark-outline" size={16} color={theme.textSecondary} style={{ marginRight: 10 }} />
                        <TextInput
                          placeholder="Repeat new password"
                          placeholderTextColor={theme.textSecondary + '70'}
                          value={forgotConfirmPassword}
                          onChangeText={setForgotConfirmPassword}
                          secureTextEntry={!showResetNewPassword}
                          style={[styles.inputTxt, { color: theme.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                        />
                        {forgotConfirmPassword.length > 0 && (
                          <Ionicons
                            name={forgotNewPassword === forgotConfirmPassword ? 'checkmark-circle' : 'close-circle'}
                            size={18}
                            color={forgotNewPassword === forgotConfirmPassword ? '#52C41A' : '#FF4D4F'}
                          />
                        )}
                      </View>
                    </View>

                    <PrimaryButton
                      label="Update Password & Sign In"
                      icon="checkmark-outline"
                      loading={loading}
                      onPress={handleForgotSaveNewPassword}
                      theme={theme}
                    />

                    <TouchableOpacity style={styles.backToLoginBtn} onPress={() => setAuthView('login')}>
                      <Ionicons name="arrow-back" size={14} color={theme.textSecondary} />
                      <Text style={[styles.backToLoginText, { color: theme.textSecondary }]}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Step 4: Success Message */}
                {forgotStep === 4 && (
                  <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                    <View style={styles.successIconCircle}>
                      <Ionicons name="checkmark" size={32} color="#16171B" />
                    </View>
                    <Text style={[styles.h1, { color: theme.text, textAlign: 'center', marginTop: 16 }]}>
                      Password Updated!
                    </Text>
                    <Text style={[styles.sub, { color: theme.textSecondary, textAlign: 'center', marginBottom: 24 }]}>
                      Your credentials have been securely updated. You can now log into your business workspace.
                    </Text>
                    <PrimaryButton
                      label="Proceed to Sign In"
                      onPress={() => {
                        setAuthView('login');
                        setLoginValue('email', forgotEmail);
                      }}
                      theme={theme}
                    />
                  </View>
                )}
              </View>
            )}

            {/* ════════════════════════════════════════════════════════════════
                VIEW 5: CREATE ACCOUNT WIZARD (STEPS 1 - 6)
            ════════════════════════════════════════════════════════════════ */}
            {authView === 'wizard' && wizardStep === 1 && (
              <View>
                <StepHeader step={1} title="Create Admin Account" sub="Set up your primary login credentials" theme={theme} />

                {/* Email */}
                <StyledInputField
                  control={step1Control}
                  name="email"
                  icon="mail-outline"
                  label="Email Address (Requires Verification)"
                  placeholder="admin@mybusiness.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  error={step1Errors.email?.message}
                  theme={theme}
                />

                {/* Password with Generator Button */}
                <View style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Create Password</Text>
                    <TouchableOpacity onPress={handleGeneratePassword} style={styles.generateBtn}>
                      <Ionicons name="flash-outline" size={12} color="#16171B" />
                      <Text style={styles.generateBtnText}>Generate Strong</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <StyledInputField
                  control={step1Control}
                  name="password"
                  icon="lock-closed-outline"
                  label=""
                  placeholder="Min. 8 chars with uppercase, lowercase, numbers & symbols"
                  secureTextEntry={!showSignupPassword}
                  error={step1Errors.password?.message}
                  theme={theme}
                  rightIcon={showSignupPassword ? 'eye-off-outline' : 'eye-outline'}
                  onRightIcon={() => setShowSignupPassword(v => !v)}
                  onKeyPress={(e: any) => {
                    if (Platform.OS === 'web' && e?.getModifierState) {
                      setCapsLockActive(e.getModifierState('CapsLock'));
                    }
                  }}
                />

                {/* Live Password Test Cases Checklist */}
                <PasswordStrengthBar password={watchSignupPwd} />

                {/* Confirm Password */}
                <StyledInputField
                  control={step1Control}
                  name="confirmPassword"
                  icon="shield-checkmark-outline"
                  label="Confirm Password"
                  placeholder="Re-enter your password"
                  secureTextEntry={!showSignupConfirm}
                  error={step1Errors.confirmPassword?.message}
                  theme={theme}
                  rightIcon={showSignupConfirm ? 'eye-off-outline' : 'eye-outline'}
                  onRightIcon={() => setShowSignupConfirm(v => !v)}
                />

                {/* Match indicator */}
                {watchSignupConfirm.length > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                    <Ionicons
                      name={watchSignupPwd === watchSignupConfirm ? 'checkmark-circle' : 'close-circle'}
                      size={14}
                      color={watchSignupPwd === watchSignupConfirm ? '#52C41A' : '#FF4D4F'}
                    />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: watchSignupPwd === watchSignupConfirm ? '#52C41A' : '#FF4D4F' }}>
                      {watchSignupPwd === watchSignupConfirm ? 'Passwords match ✓' : 'Passwords do not match ✕'}
                    </Text>
                  </View>
                )}

                {/* 4-Digit Quick PIN Setup */}
                <StyledInputField
                  control={step1Control}
                  name="pin"
                  icon="grid-outline"
                  label="Set 4-Digit Terminal Quick PIN (ATM Keypad)"
                  placeholder="e.g. 2468 (For instant POS terminal login)"
                  keyboardType="numeric"
                  maxLength={4}
                  error={step1Errors.pin?.message}
                  theme={theme}
                />

                <PrimaryButton
                  label="Send Verification Code →"
                  loading={loading}
                  onPress={handleStep1Submit(onStep1Next)}
                  theme={theme}
                />

                <TouchableOpacity style={styles.backToLoginBtn} onPress={() => setAuthView('login')}>
                  <Ionicons name="arrow-back" size={14} color={theme.textSecondary} />
                  <Text style={[styles.backToLoginText, { color: theme.textSecondary }]}>Back to Sign In</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Step 2: Mandatory OTP Verification */}
            {authView === 'wizard' && wizardStep === 2 && (
              <View>
                <StepHeader
                  step={2}
                  title="Email Verification"
                  sub={`We sent a verification email to ${signupTempData?.email || 'your email'}. Enter the 6-digit code or click the confirmation link.`}
                  theme={theme}
                />

                <OtpInput value={otpCode} onChange={setOtpCode} theme={theme} />

                <View style={styles.resendRow}>
                  {resendCountdown > 0 ? (
                    <Text style={[styles.resendTimerText, { color: theme.textSecondary }]}>
                      Resend email to {signupTempData?.email} in {resendCountdown}s
                    </Text>
                  ) : (
                    <TouchableOpacity
                      onPress={async () => {
                        if (!signupTempData?.email) return;
                        setLoading(true);
                        try {
                          if (isSupabaseConfigured()) {
                            const { error: rErr } = await supabase.auth.resend({
                              type: 'signup',
                              email: signupTempData.email.trim(),
                            });
                            if (rErr) {
                              if (rErr.message.toLowerCase().includes('rate limit')) {
                                throw new Error('Supabase email limit exceeded (max 3/hour on free tier). Please check your Spam/Junk folder for previously sent emails.');
                              }
                              throw rErr;
                            }
                          } else {
                            const result = await sendEmailOtp(signupTempData.email, 'signup');
                            setEmailNotification({ email: signupTempData.email, code: result.code });
                          }
                          setResendCountdown(60);
                          setInfoMessage(`Fresh verification email sent to ${signupTempData.email}`);
                        } catch (e: any) {
                          setError(e.message || 'Could not resend verification email');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                    >
                      <Text style={styles.resendActionText}>Resend Email to {signupTempData?.email}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <PrimaryButton
                  label="Verify Code & Proceed →"
                  loading={loading}
                  disabled={otpCode.length < 6}
                  onPress={handleOtpVerify}
                  theme={theme}
                />

                <TouchableOpacity
                  style={{
                    marginTop: 12,
                    paddingVertical: 13,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#C5A880',
                    backgroundColor: '#FBF9F5',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 8,
                  }}
                  onPress={async () => {
                    if (!signupTempData?.email) return;
                    setLoading(true);
                    setError('');
                    try {
                      if (isSupabaseConfigured()) {
                        const { error: suErr } = await supabase.auth.signInWithPassword({
                          email: signupTempData.email.trim(),
                          password: signupTempData.password,
                        });
                        if (suErr) {
                          throw new Error('Email is not verified yet. Please click the link in your email inbox first.');
                        }
                      }
                      setWizardStep(3);
                    } catch (e: any) {
                      setError(e.message || 'Email is not verified yet. Please click the link in your email first.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#16171B" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#16171B' }}>
                    I Clicked the Email Link → Continue
                  </Text>
                </TouchableOpacity>

                <BackLink onPress={() => setWizardStep(1)} theme={theme} />
              </View>
            )}

            {/* Step 3: Category */}
            {authView === 'wizard' && wizardStep === 3 && (
              <View>
                <StepHeader step={3} title="What's your business?" sub="Pick your industry to activate targeted features" theme={theme} />
                <CategoryPicker
                  selected={selectedCategory}
                  onSelect={setSelectedCategory}
                  activeGroup={activeGroup}
                  onGroupChange={setActiveGroup}
                  theme={theme}
                />
                <PrimaryButton label="Continue →" onPress={() => setWizardStep(4)} theme={theme} />
                <BackLink onPress={() => setWizardStep(2)} theme={theme} />
              </View>
            )}

            {/* Step 4: Profile with International Phone Code Selector & Realistic Address Validation */}
            {authView === 'wizard' && wizardStep === 4 && (
              <View>
                <StepHeader step={4} title="Business Profile" sub="Tell us about your establishment" theme={theme} />
                
                <StyledInputField
                  control={step4Control}
                  name="businessName"
                  icon="business-outline"
                  label="Business / Store Name"
                  placeholder="e.g. Vault Luxury Goods"
                  error={step4Errors.businessName?.message}
                  theme={theme}
                />

                {/* International Phone Selector & Input */}
                <View style={{ marginBottom: 14 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Contact Phone (Select Country)</Text>
                  
                  {/* Country Flag Pills */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 8 }}
                    contentContainerStyle={{ gap: 6 }}
                  >
                    {COUNTRY_CODES.map((c) => {
                      const isSelected = selectedCountryCode === c.code;
                      return (
                        <TouchableOpacity
                          key={c.code}
                          style={[
                            styles.countryPill,
                            isSelected && styles.countryPillActive,
                          ]}
                          onPress={() => {
                            setSelectedCountryCode(c.code);
                          }}
                        >
                          <Text style={{ fontSize: 13 }}>{c.flag}</Text>
                          <Text style={[styles.countryPillText, isSelected && styles.countryPillTextActive]}>
                            {c.code}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <Controller
                    control={step4Control}
                    name="phone"
                    render={({ field: { onChange, value } }) => (
                      <View>
                        <View style={[styles.inputRow, { borderColor: step4Errors.phone ? '#FF4D4F' : '#E4E6EB' }]}>
                          <View style={styles.phonePrefixBox}>
                            <Text style={{ fontSize: 14 }}>{selectedCountry.flag}</Text>
                            <Text style={styles.phonePrefixText}>{selectedCountryCode}</Text>
                          </View>
                          <TextInput
                            placeholder={selectedCountry.placeholder}
                            placeholderTextColor={theme.textSecondary + '70'}
                            value={value}
                            onChangeText={onChange}
                            keyboardType="phone-pad"
                            style={[styles.inputTxt, { color: theme.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                          />
                        </View>
                        {step4Errors.phone && <Text style={styles.fieldErr}>{step4Errors.phone.message}</Text>}
                      </View>
                    )}
                  />
                </View>

                {/* Realistic Physical Store Address */}
                <View style={{ marginBottom: 14 }}>
                  <StyledInputField
                    control={step4Control}
                    name="address"
                    icon="location-outline"
                    label="Physical Store Address"
                    placeholder="e.g. Shop #12, Commercial Plaza, Lahore / 24 Park Ave, NY"
                    error={step4Errors.address?.message}
                    theme={theme}
                  />
                  {watchAddress.length > 0 && !step4Errors.address && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8, marginBottom: 8, marginLeft: 2 }}>
                      <Ionicons name="checkmark-circle" size={13} color="#52C41A" />
                      <Text style={{ fontSize: 11, color: '#52C41A', fontWeight: '600' }}>Valid physical address format</Text>
                    </View>
                  )}
                </View>

                {/* Logo Uploader */}
                <Controller control={step4Control} name="logoUri" render={({ field: { onChange, value } }) => {
                  const bName = step4Control._formValues.businessName || 'V';
                  return (
                    <View style={{ marginVertical: 8 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Brand Logo (optional)</Text>
                      <LogoUploader value={value} onChange={onChange} initials={bName.charAt(0).toUpperCase()} size={68} label={value ? 'Logo uploaded ✓' : 'Tap to upload store logo'} />
                    </View>
                  );
                }} />

                <PrimaryButton label="Continue →" onPress={handleStep4Submit(() => setWizardStep(5))} theme={theme} />
                <BackLink onPress={() => setWizardStep(3)} theme={theme} />
              </View>
            )}

            {/* Step 5: Options */}
            {authView === 'wizard' && wizardStep === 5 && (
              <View>
                <StepHeader step={5} title="Workspace Customization" sub={`Configuring smart modules for ${selectedCat?.label || 'your business'}`} theme={theme} />

                {selectedCategory === 'restaurant' && (
                  <QuestionBlock label="How many dine-in tables?" theme={theme}>
                    <TextInput style={[styles.numInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]} keyboardType="number-pad" value={tablesCount} onChangeText={setTablesCount} />
                  </QuestionBlock>
                )}
                {selectedCategory === 'gym' && (
                  <QuestionBlock label="Pre-seed membership plans?" theme={theme}>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                      <ToggleChip label="Standard Plans" active={enableTrials} onPress={() => setEnableTrials(true)} theme={theme} />
                      <ToggleChip label="Custom Setup" active={!enableTrials} onPress={() => setEnableTrials(false)} theme={theme} />
                    </View>
                  </QuestionBlock>
                )}
                {selectedCategory === 'tailor' && (
                  <QuestionBlock label="Enable trial/delivery reminders?" theme={theme}>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                      <ToggleChip label="Yes" active={enableTrials} onPress={() => setEnableTrials(true)} theme={theme} />
                      <ToggleChip label="No" active={!enableTrials} onPress={() => setEnableTrials(false)} theme={theme} />
                    </View>
                  </QuestionBlock>
                )}
                {(selectedCategory === 'grocery' || selectedCategory === 'pharmacy') && (
                  <QuestionBlock label="Low-stock alert threshold (qty):" theme={theme}>
                    <TextInput style={[styles.numInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]} keyboardType="number-pad" value={stockThreshold} onChangeText={setStockThreshold} />
                  </QuestionBlock>
                )}
                {!['restaurant', 'gym', 'tailor', 'grocery', 'pharmacy'].includes(selectedCategory) && (
                  <InfoBanner icon="checkmark-circle-outline" text={`Optimal ${selectedCat?.label} defaults will be applied.`} theme={theme} />
                )}

                <PrimaryButton label="Generate My Workspace →" onPress={handleStep4Submit(() => setWizardStep(6))} theme={theme} />
                <BackLink onPress={() => setWizardStep(4)} theme={theme} />
              </View>
            )}

            {/* Step 6: Generating */}
            {authView === 'wizard' && wizardStep === 6 && (
              <GenerationLoader theme={theme} category={selectedCat?.label || ''} onFinished={handleStep4Submit(handleWizardFinish)} />
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </View>
  );
}

// ─── Password Strength & Test Cases Checklist Component ───────────────────────
function PasswordStrengthBar({ password }: { password: string }) {
  const strength = evaluatePasswordStrength(password);

  return (
    <View style={styles.strengthContainer}>
      <View style={styles.strengthHeader}>
        <Text style={styles.strengthLabelText}>Password Complexity Requirements:</Text>
        <Text style={[styles.strengthBadge, { color: strength.color }]}>{strength.label}</Text>
      </View>

      {/* Progress Bars */}
      <View style={styles.strengthBarsRow}>
        {[1, 2, 3, 4].map((step) => {
          const isActive = strength.score >= step;
          return (
            <View
              key={step}
              style={[
                styles.strengthSegment,
                { backgroundColor: isActive ? strength.color : '#E4E6EB' },
              ]}
            />
          );
        })}
      </View>

      {/* Test Cases Checklist Grid */}
      <View style={styles.criteriaGrid}>
        <CriteriaPill label="Lowercase (a-z)" met={strength.hasLowercase} />
        <CriteriaPill label="Uppercase (A-Z)" met={strength.hasUppercase} />
        <CriteriaPill label="Number (0-9)" met={strength.hasNumber} />
        <CriteriaPill label="Symbol (!@#$)" met={strength.hasSpecial} />
        <CriteriaPill label="8+ Chars" met={strength.hasMinLength} />
      </View>
    </View>
  );
}

function CriteriaPill({ label, met }: { label: string; met: boolean }) {
  return (
    <View style={[styles.criteriaPill, met && styles.criteriaPillMet]}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'ellipse-outline'}
        size={12}
        color={met ? '#16171B' : '#8C8D94'}
      />
      <Text style={[styles.criteriaPillText, met && styles.criteriaPillTextMet]}>{label}</Text>
    </View>
  );
}

// ─── Category Picker ─────────────────────────────────────────────────────────
function CategoryPicker({
  selected, onSelect, activeGroup, onGroupChange, theme,
}: {
  selected: BusinessCategoryId;
  onSelect: (id: BusinessCategoryId) => void;
  activeGroup: string;
  onGroupChange: (g: string) => void;
  theme: any;
}) {
  const filtered = BUSINESS_CATEGORIES.filter(c => c.group === activeGroup);
  const scrollRef = useRef<ScrollView>(null);

  return (
    <View style={{ marginBottom: 16 }}>
      {/* Group tabs */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.groupScroll}
        contentContainerStyle={styles.groupScrollContent}
      >
        {CATEGORY_GROUPS.map(g => {
          const isActive = activeGroup === g;
          return (
            <Pressable
              key={g}
              onPress={() => onGroupChange(g)}
              style={[
                styles.groupPill,
                {
                  backgroundColor: isActive ? '#16171B' : '#F4F5F7',
                  borderColor: isActive ? '#16171B' : '#E4E6EB',
                },
              ]}
            >
              <Text style={[styles.groupPillTxt, { color: isActive ? '#C5A880' : theme.textSecondary }]}>
                {g}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Photo grid */}
      <View style={styles.catGrid}>
        {filtered.map(cat => {
          const isSel = selected === cat.id;
          const img = CAT_IMAGES[cat.id] || CAT_IMAGES.general;
          return (
            <Pressable
              key={cat.id}
              onPress={() => onSelect(cat.id)}
              style={({ pressed }) => [
                styles.catCard,
                isSel && styles.catCardSelected,
                pressed && { opacity: 0.88 },
              ]}
            >
              <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
              <View style={[styles.catDim, isSel && { backgroundColor: 'rgba(22, 23, 27, 0.72)' }]} />
              <View style={styles.catBottom}>
                <Text style={styles.catLabel} numberOfLines={2}>{cat.label}</Text>
              </View>
              {isSel && (
                <View style={styles.catBadge}>
                  <Ionicons name="checkmark" size={11} color="#16171B" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Selected preview strip */}
      {BUSINESS_CATEGORIES.find(c => c.id === selected) && (
        <View style={styles.selStrip}>
          <Ionicons name="checkmark-circle" size={18} color="#16171B" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.selName}>
              {BUSINESS_CATEGORIES.find(c => c.id === selected)!.label}
            </Text>
            <Text style={styles.selDesc}>
              {BUSINESS_CATEGORIES.find(c => c.id === selected)!.description}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Generation Loader ────────────────────────────────────────────────────────
function GenerationLoader({ theme, category, onFinished }: { theme: any; category: string; onFinished: () => void }) {
  const [done, setDone] = useState<number[]>([]);
  const steps = [
    { icon: 'server-outline',      label: 'Provisioning encrypted local SQLite database…' },
    { icon: 'construct-outline',   label: `Configuring ${category} inventory modules…` },
    { icon: 'people-outline',      label: 'Setting up role permissions & credentials…' },
    { icon: 'grid-outline',        label: 'Building your high-speed POS dashboard…' },
  ];
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      if (i < steps.length) { setDone(prev => [...prev, i]); i++; }
      else { clearInterval(t); onFinished(); }
    }, 800);
    return () => clearInterval(t);
  }, [onFinished, steps.length]);

  return (
    <View style={{ alignItems: 'center', paddingVertical: 32 }}>
      <ActivityIndicator size="large" color="#16171B" style={{ marginBottom: 24 }} />
      <Text style={[styles.h1, { color: theme.text, textAlign: 'center', marginBottom: 8 }]}>Building Workspace</Text>
      <Text style={[styles.sub, { color: theme.textSecondary, textAlign: 'center', marginBottom: 28 }]}>
        Activating your custom business modules…
      </Text>
      <View style={{ width: '100%', gap: 14 }}>
        {steps.map((s, i) => {
          const isDone = done.includes(i);
          return (
            <View key={i} style={[styles.genRow, { opacity: isDone ? 1 : 0.3 }]}>
              <View style={[styles.genIconWrap, { backgroundColor: isDone ? '#22C55E' : '#E4E6EB' }]}>
                <Ionicons name={(isDone ? 'checkmark' : s.icon) as any} size={14} color="#16171B" />
              </View>
              <Text style={[styles.genTxt, { color: isDone ? theme.text : theme.textSecondary, fontWeight: isDone ? '700' : '500' }]}>
                {s.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Reusable Helper Components ───────────────────────────────────────────────

function StepHeader({ step, title, sub, theme }: { step: number; title: string; sub: string; theme: any }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={[styles.h1, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.sub, { color: theme.textSecondary }]}>{sub}</Text>
    </View>
  );
}

function StyledInputField({ control, name, icon, label, placeholder, secureTextEntry, keyboardType, autoCapitalize, error, theme, rightIcon, onRightIcon, onKeyPress }: any) {
  return (
    <Controller control={control} name={name} render={({ field: { onChange, value } }) => (
      <View style={{ marginBottom: 14 }}>
        {!!label && <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>}
        <View style={[styles.inputRow, { borderColor: error ? '#FF4D4F' : '#E4E6EB' }]}>
          <Ionicons name={icon} size={16} color={theme.textSecondary} style={{ marginRight: 10 }} />
          <TextInput
            placeholder={placeholder}
            placeholderTextColor={theme.textSecondary + '70'}
            value={value}
            onChangeText={onChange}
            secureTextEntry={secureTextEntry}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize || 'none'}
            onKeyPress={onKeyPress}
            style={[styles.inputTxt, { color: theme.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
          />
          {rightIcon && (
            <TouchableOpacity onPress={onRightIcon} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={rightIcon} size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        {error && <Text style={styles.fieldErr}>{error}</Text>}
      </View>
    )} />
  );
}

function OtpInput({ value, onChange, theme }: { value: string; onChange: (v: string) => void; theme: any }) {
  const handlePaste = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        const digits = text.replace(/[^0-9]/g, '').slice(0, 6);
        if (digits) onChange(digits);
      }
    } catch (_) {}
  };

  return (
    <View style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginBottom: 0 }]}>6-Digit Verification Code</Text>
        {Platform.OS === 'web' && (
          <TouchableOpacity onPress={handlePaste} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="clipboard-outline" size={14} color="#0958D9" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#0958D9' }}>Paste Code</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={[styles.inputRow, { borderColor: '#E4E6EB', justifyContent: 'center' }]}>
        <Ionicons name="key-outline" size={16} color={theme.textSecondary} style={{ marginRight: 10 }} />
        <TextInput
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, 6))}
          placeholder="• • • • • •"
          placeholderTextColor={theme.textSecondary + '60'}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus={true}
          style={[styles.inputTxt, { color: theme.text, letterSpacing: 8, fontSize: 22, fontWeight: '800' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
        />
      </View>
    </View>
  );
}

function PrimaryButton({ label, icon, onPress, loading, disabled, theme }: any) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, { opacity: (loading || disabled) ? 0.6 : 1 }]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color="#16171B" size="small" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon && <Ionicons name={icon} size={18} color="#16171B" />}
          <Text style={styles.primaryBtnTxt}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function BackLink({ onPress, theme }: any) {
  return (
    <TouchableOpacity style={styles.backLink} onPress={onPress}>
      <Ionicons name="arrow-back" size={14} color={theme.textSecondary} />
      <Text style={[styles.backTxt, { color: theme.textSecondary }]}>Back</Text>
    </TouchableOpacity>
  );
}

function InfoBanner({ icon, text, theme }: { icon: string; text: string; theme: any }) {
  return (
    <View style={styles.infoBanner}>
      <Ionicons name={icon as any} size={16} color="#16171B" />
      <Text style={styles.infoTxt}>{text}</Text>
    </View>
  );
}

function QuestionBlock({ label, children, theme }: { label: string; children: React.ReactNode; theme: any }) {
  return (
    <View style={[styles.qBlock, { backgroundColor: '#F4F5F7', borderColor: '#E4E6EB' }]}>
      <Text style={[styles.qLabel, { color: theme.text }]}>{label}</Text>
      {children}
    </View>
  );
}

function ToggleChip({ label, active, onPress, theme }: any) {
  return (
    <TouchableOpacity
      style={[styles.toggleChip, { backgroundColor: active ? '#16171B' : 'transparent', borderColor: active ? '#16171B' : '#E4E6EB' }]}
      onPress={onPress}
    >
      <Text style={[styles.toggleTxt, { color: active ? '#C5A880' : theme.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#FFFFFF' },

  // Left Hero Panel (Obsidian + Champagne Gold)
  leftPanel: { width: '44%', position: 'relative', overflow: 'hidden' },
  heroDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(22, 23, 27, 0.75)' },
  heroOverlayGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 380,
    backgroundColor: 'rgba(22, 23, 27, 0.88)',
  },
  heroContent: { flex: 1, justifyContent: 'flex-end', padding: 44, paddingBottom: 52 },
  heroBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  heroLogoIcon: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#C5A880',
    alignItems: 'center', justifyContent: 'center',
  },
  heroBrandText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  heroBadge: {
    backgroundColor: 'rgba(197, 168, 128, 0.15)',
    borderWidth: 1, borderColor: '#C5A880',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  heroBadgeText: { color: '#C5A880', fontSize: 11, fontWeight: '700' },
  heroTitle: { fontSize: 40, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1, lineHeight: 46, marginBottom: 12 },
  heroTagline: { fontSize: 14, color: 'rgba(255, 255, 255, 0.75)', lineHeight: 22, marginBottom: 24 },

  securityHighlightCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 18,
  },
  securityIconBox: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(197, 168, 128, 0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  securityTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  securitySub: { color: 'rgba(255, 255, 255, 0.65)', fontSize: 11, lineHeight: 16 },

  heroCatPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24, paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  heroCatPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Right Panel
  rightPanel: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: {
    flexGrow: 1, justifyContent: 'center',
    paddingVertical: 36, paddingHorizontal: 48,
    width: '100%', maxWidth: 520, alignSelf: 'center',
  },

  // Mobile Brand Header
  mobileBrand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  brandDot: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  brandSub: { fontSize: 9, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginTop: 1 },

  // Typography
  h1: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginBottom: 4 },
  sub: { fontSize: 13, fontWeight: '500', lineHeight: 20 },

  // Live Email Toast Notification
  emailToastCard: {
    backgroundColor: '#16171B', borderRadius: 14, padding: 14, marginBottom: 18,
    borderWidth: 1.5, borderColor: '#C5A880',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10,
  },
  emailToastHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  emailToastIconBox: {
    width: 28, height: 28, borderRadius: 7, backgroundColor: '#C5A880',
    alignItems: 'center', justifyContent: 'center',
  },
  emailToastSender: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  emailToastRecipient: { fontSize: 11, color: '#C5A880' },
  emailToastBody: { backgroundColor: 'rgba(255, 255, 255, 0.06)', borderRadius: 10, padding: 12, alignItems: 'center' },
  emailToastSubject: { fontSize: 11, color: 'rgba(255, 255, 255, 0.8)', fontWeight: '600', marginBottom: 8 },
  emailOtpCodeBox: {
    backgroundColor: '#212229', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: '#C5A880', marginBottom: 10,
  },
  emailOtpCodeText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  autoFillButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#C5A880', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
  },
  autoFillButtonText: { color: '#16171B', fontSize: 11, fontWeight: '800' },

  // Country Code Picker Styles
  countryPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F4F5F7', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#E4E6EB',
  },
  countryPillActive: {
    backgroundColor: '#16171B', borderColor: '#16171B',
  },
  countryPillText: { fontSize: 12, fontWeight: '700', color: '#595959' },
  countryPillTextActive: { color: '#C5A880' },
  phonePrefixBox: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingRight: 8, borderRightWidth: 1.5, borderRightColor: '#E4E6EB', marginRight: 10,
  },
  phonePrefixText: { fontSize: 14, fontWeight: '800', color: '#16171B' },

  // Verified Notice Pill on Login
  verifiedNoticePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.15)', borderWidth: 1, borderColor: '#22C55E',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12,
  },
  verifiedNoticeText: { fontSize: 11, fontWeight: '800', color: '#22C55E' },

  // Unverified Email Banner
  unverifiedBannerBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#FBF9F5', borderWidth: 1.5, borderColor: '#E8E4DC',
    borderRadius: 14, padding: 16, marginBottom: 18,
  },
  unverifiedBannerTitle: { fontSize: 15, fontWeight: '800', color: '#16171B', marginBottom: 4 },
  unverifiedBannerSub: { fontSize: 12, color: '#374151', lineHeight: 18 },

  // Tab switcher
  tabBar: {
    flexDirection: 'row', backgroundColor: '#F4F5F7',
    borderRadius: 12, padding: 4, marginBottom: 20,
    borderWidth: 1, borderColor: '#E4E6EB',
  },
  tabButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, borderRadius: 9, gap: 6,
  },
  tabButtonActive: {
    backgroundColor: '#1A1A1A',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  tabTextActive: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },

  // Inputs
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, height: 48,
    backgroundColor: '#FAFAFA',
  },
  inputTxt: { flex: 1, fontSize: 14, fontWeight: '500' },
  fieldErr: { color: '#FF4D4F', fontSize: 11, fontWeight: '600', marginTop: 4, marginLeft: 2 },

  // Options row
  optionsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 2, marginBottom: 20,
  },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: '#8C8D94',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
  },
  checkboxChecked: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  checkboxLabel: { fontSize: 12, fontWeight: '600' },
  forgotLink: { fontSize: 12, fontWeight: '700', color: '#16171B' },

  // Caps Lock Warning
  capsLockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFBE6', borderColor: '#FFE58F', borderWidth: 1,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 12,
  },
  capsLockText: { color: '#D48806', fontSize: 11, fontWeight: '700' },

  // Buttons
  primaryBtn: {
    height: 48, borderRadius: 12, backgroundColor: '#1A1A1A',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#16171B', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 6,
  },
  primaryBtnTxt: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

  createAccountBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 46, borderRadius: 12, borderWidth: 1.5, backgroundColor: '#FFFFFF',
  },
  createAccountBtnText: { fontSize: 13, fontWeight: '800', color: '#16171B' },

  generateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#1A1A1A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  generateBtnText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },

  // Alerts
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16,
  },
  alertText: { flex: 1, fontSize: 12, fontWeight: '600' },

  // Presets & Roles
  sectionHeading: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },
  presetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    width: '48%', padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#E4E6EB',
  },
  presetIconWrap: {
    width: 28, height: 28, borderRadius: 7, backgroundColor: '#F5F2EC',
    alignItems: 'center', justifyContent: 'center',
  },
  presetRole: { fontSize: 12, fontWeight: '800' },
  presetDesc: { fontSize: 10, fontWeight: '500' },

  // Divider
  divRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  divLine: { flex: 1, height: 1 },
  divTxt: { fontSize: 12, fontWeight: '600' },

  // Strength & Test Cases Bar
  strengthContainer: { marginTop: 4, marginBottom: 14 },
  strengthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  strengthLabelText: { fontSize: 11, fontWeight: '700', color: '#8C8D94' },
  strengthBadge: { fontSize: 11, fontWeight: '800' },
  strengthBarsRow: { flexDirection: 'row', gap: 4, height: 4, marginBottom: 8 },
  strengthSegment: { flex: 1, borderRadius: 2 },
  criteriaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  criteriaPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F4F5F7', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6,
    borderWidth: 1, borderColor: '#E4E6EB',
  },
  criteriaPillMet: { backgroundColor: 'rgba(34, 197, 94, 0.12)', borderColor: '#22C55E' },
  criteriaPillText: { fontSize: 10, fontWeight: '600', color: '#8C8D94' },
  criteriaPillTextMet: { color: '#22C55E', fontWeight: '800' },

  // ATM PIN Display Screen & Slots
  atmDisplayCard: {
    alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 16,
    padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6,
    elevation: 2,
  },
  atmSlotsRow: {
    flexDirection: 'row', gap: 12, justifyContent: 'center', marginVertical: 4,
  },
  atmSlot: {
    width: 52, height: 58, borderRadius: 12, backgroundColor: '#FFFFFF',
    borderWidth: 2, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
    elevation: 1,
  },
  atmSlotFilled: {
    borderColor: '#16171B', backgroundColor: '#FFFFFF',
  },
  atmSlotActive: {
    borderColor: '#3B82F6', borderWidth: 2, backgroundColor: 'rgba(59, 130, 246, 0.04)',
  },
  atmSlotDigit: {
    fontSize: 24, fontWeight: '800', color: '#16171B',
  },
  atmSlotBullet: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#16171B',
  },
  atmCursorBar: {
    width: 2, height: 22, backgroundColor: '#3B82F6', borderRadius: 1,
  },

  // ATM Keypad Grid
  atmKeypadGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10,
    maxWidth: 340, alignSelf: 'center', width: '100%',
  },
  atmKey: {
    width: '30%', height: 56, borderRadius: 12, backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1.5 }, shadowOpacity: 0.05, shadowRadius: 3,
    elevation: 1,
  },
  atmKeyCancel: {
    backgroundColor: '#FEF2F2', borderColor: '#FECACA',
  },
  atmKeyDelete: {
    backgroundColor: '#F8FAFC', borderColor: '#E2E8F0',
  },
  atmKeyNumber: {
    fontSize: 20, fontWeight: '800', lineHeight: 24,
  },
  atmKeyLetters: {
    fontSize: 9, fontWeight: '700', color: '#94A3B8', letterSpacing: 1.2, marginTop: -2,
  },

  pinDisplayTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 12 },
  pinHint: { fontSize: 11, color: '#8C8D94' },

  // Back Links
  backToLoginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 18, paddingVertical: 6,
  },
  backToLoginText: { fontSize: 13, fontWeight: '700' },
  backLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  backTxt: { fontSize: 13, fontWeight: '700' },

  // OTP Resend
  resendRow: { alignItems: 'center', marginBottom: 16 },
  resendTimerText: { fontSize: 12, fontWeight: '600' },
  resendActionText: { fontSize: 12, fontWeight: '800', color: '#16171B', textDecorationLine: 'underline' },

  // Success Circle
  successIconCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#22C55E',
    alignItems: 'center', justifyContent: 'center',
  },

  // Steps
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  stepDot: { height: 6, borderRadius: 3 },
  stepLabel: { fontSize: 11, fontWeight: '700', marginLeft: 6 },

  // Category Picker Styles
  groupScroll: { marginBottom: 12 },
  groupScrollContent: { gap: 8, paddingRight: 8 },
  groupPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  groupPillTxt: { fontSize: 12, fontWeight: '700' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  catCard: {
    width: '31%', height: 80, borderRadius: 10, overflow: 'hidden',
    position: 'relative', borderWidth: 2, borderColor: 'transparent',
  },
  catCardSelected: { borderColor: '#16171B' },
  catDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  catBottom: { position: 'absolute', bottom: 6, left: 6, right: 6 },
  catLabel: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  catBadge: {
    position: 'absolute', top: 5, right: 5, width: 18, height: 18,
    borderRadius: 9, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center',
  },
  selStrip: {
    flexDirection: 'row', alignItems: 'center', padding: 10,
    borderRadius: 10, backgroundColor: '#FBF9F5',
    borderWidth: 1, borderColor: '#E8E4DC',
  },
  selName: { fontSize: 13, fontWeight: '800', color: '#16171B' },
  selDesc: { fontSize: 11, color: '#595959', marginTop: 1 },

  // Generation loader
  genRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  genIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  genTxt: { fontSize: 13 },

  // Info & Question Blocks
  infoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F5F2EC', padding: 12, borderRadius: 10, marginBottom: 16,
  },
  infoTxt: { fontSize: 12, fontWeight: '600', color: '#16171B', flex: 1 },
  qBlock: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  qLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  numInput: { height: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 14, fontWeight: '600' },
  toggleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  toggleTxt: { fontSize: 12, fontWeight: '700' },
});
