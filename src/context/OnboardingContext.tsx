/**
 * OnboardingContext
 *
 * Professional Guided Tour & Onboarding Manager for Vaypar POS.
 *
 * Features:
 *   1. Welcome Modal: Introduction with "Start Tour" & "Skip for Now"
 *   2. Interactive Spotlight Steps: Real UI feature highlights (5–8 key steps)
 *   3. Completion Modal: Celebration & "Let's Get Started"
 *   4. Per-User Dual Persistence: AsyncStorage + SQLite (keyed by user.id)
 *   5. Role-Specific Step Filtering
 *   6. Manual "Take a Tour" restart from Settings
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import * as sqlite from '../services/sqlite';

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const STORAGE_PREFIX = 'vaypar_guided_tour_v2_';

// ─── Tour Steps Definition ─────────────────────────────────────────────────────
export interface TourStepDef {
  id: string;
  targetId: string; // DOM ID: 'tour-sidebar', 'tour-metrics', 'tour-revenue-chart', 'tour-pos', 'tour-search', 'tour-online-store', 'tour-settings'
  title: string;
  badge: string;
  icon: string; // Ionicons icon name
  description: string;
  tip?: string;
  roles?: Array<'owner' | 'manager' | 'cashier' | 'employee'>;
  tooltipAnchor?: 'top' | 'bottom' | 'left' | 'right';
  emoji?: string;
  spotlightX?: number;
  spotlightY?: number;
  spotlightW?: number;
  spotlightH?: number;
}

export const GUIDED_TOUR_STEPS: TourStepDef[] = [
  {
    id: 'sidebar_nav',
    targetId: 'tour-nav-menu',
    title: 'Main Business Navigation',
    badge: 'Navigation',
    icon: 'grid-outline',
    description: 'Switch effortlessly between POS billing, product inventory, financial performance analytics, and store settings.',
    tip: 'Everything you need to operate your store is organized right here in the left menu.',
  },
  {
    id: 'kpi_metrics',
    targetId: 'tour-metrics',
    title: 'Real-Time Financial Metrics',
    badge: 'Live KPIs',
    icon: 'trending-up-outline',
    description: "Monitor your store's live financial pulse — track today's gross revenue, active invoices issued, and operational net profit.",
    tip: 'These figures calculate dynamically from your local SQLite database in real time.',
  },
  {
    id: 'revenue_chart',
    targetId: 'tour-revenue-chart',
    title: 'Sales & Inflow Waves',
    badge: 'Analytics',
    icon: 'bar-chart-outline',
    description: 'Track daily trading peaks, examine weekly inflows, or inspect monthly and annual growth trends across your store.',
    tip: 'Tap or hover on any bar interval to see exact collection amounts and payment methods.',
    roles: ['owner', 'manager'],
  },
  {
    id: 'pos_billing',
    targetId: 'tour-pos',
    title: 'POS & WhatsApp Billing Terminal',
    badge: 'POS Terminal',
    icon: 'receipt-outline',
    description: 'Ring up walk-in sales in seconds, print standard 80mm/58mm thermal receipts, and send digital PDF invoices directly to customer WhatsApp.',
    tip: 'Customer phone numbers format automatically for direct WhatsApp dispatch with zero extra clicks.',
  },
  {
    id: 'universal_search',
    targetId: 'tour-search',
    title: 'Instant Workspace Search',
    badge: 'Quick Search',
    icon: 'search-outline',
    description: 'Quickly find registered items in your catalog, pull up past invoices by invoice ID or phone number, or look up customer balances.',
    tip: 'Type any product name, customer name, or phone number to find matching records immediately.',
  },
  {
    id: 'product_inventory',
    targetId: 'tour-inventory',
    title: 'Product Inventory & Tags',
    badge: 'Inventory',
    icon: 'cube-outline',
    description: 'Manage registered products, real-time stock levels, low-stock reorder alerts, and custom category tags directly from SQLite.',
    tip: 'Tap Manage to register new items, edit pricing, or configure barcode tags.',
  },
  {
    id: 'settings_hardware',
    targetId: 'tour-settings',
    title: 'Hardware & Store Settings',
    badge: 'Configuration',
    icon: 'settings-outline',
    description: 'Configure USB and Bluetooth thermal printers, customize receipts, manage staff security PIN codes, or replay this tour anytime.',
    tip: 'Visit Settings anytime you connect a new printer or want to update business details.',
  },
];

// ─── Modal States ─────────────────────────────────────────────────────────────
export const TOUR_STEPS = GUIDED_TOUR_STEPS;

export type ChecklistStepId =
  | 'account_created'
  | 'upload_logo'
  | 'add_employee'
  | 'add_product'
  | 'explore_pos'
  | 'first_sale';

export interface ChecklistStep {
  id: ChecklistStepId;
  label: string;
  desc?: string;
  description?: string;
  route?: string;
  skippable?: boolean;
}

export const CHECKLIST_STEPS: ChecklistStep[] = [
  { id: 'account_created', label: 'Create Account', desc: 'Signed up and verified' },
  { id: 'upload_logo', label: 'Add Business Branding', desc: 'Upload your store logo & theme', route: '/settings' },
  { id: 'add_employee', label: 'Add Staff Member', desc: 'Create cashier or staff profile', route: '/users' },
  { id: 'add_product', label: 'Add First Product', desc: 'Add inventory items to catalog', route: '/products' },
  { id: 'explore_pos', label: 'Explore POS Checkout', desc: 'Inspect POS billing interface', route: '/bills' },
  { id: 'first_sale', label: 'Issue First Bill', desc: 'Generate a customer invoice', route: '/bills' },
];

export type TourModalState = 'idle' | 'welcome' | 'touring' | 'completed';

export interface UserTourPersistedState {
  userId: string;
  status: 'completed' | 'skipped' | 'not_started';
  version: string;
  completedAt?: string;
  skippedAt?: string;
  updatedAt?: string;
}

// ─── Context Interface ────────────────────────────────────────────────────────
interface OnboardingContextType {
  // Tour state
  tourModalState: TourModalState;
  tourStep: number;
  activeSteps: TourStepDef[];
  currentStepDef: TourStepDef | null;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  tourStatus: 'completed' | 'skipped' | 'not_started';
  hasCheckedStatus: boolean;

  // Tour actions
  startTour: () => void;
  advanceTour: () => void;
  rewindTour: () => void;
  skipTour: () => void;
  finishTour: () => void;
  restartTour: () => void;
  closeTourModal: () => void;

  // Legacy compat aliases
  tourActive: boolean;
  tourSeen: boolean;
  endTour: () => void;
  replayTour: () => void;

  // Legacy checklist compat
  checklistVisible: boolean;
  checklistCompleted: Record<string, boolean>;
  checklistDismissed: boolean;
  markStepComplete: (id: any) => void;
  skipStep: (id: any) => void;
  dismissChecklist: () => void;
  openChecklist: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  const [tourModalState, setTourModalState] = useState<TourModalState>('idle');
  const [tourStep, setTourStep] = useState<number>(0);
  const [tourStatus, setTourStatus] = useState<'completed' | 'skipped' | 'not_started'>('not_started');
  const [hasCheckedStatus, setHasCheckedStatus] = useState<boolean>(false);

  // Filter tour steps based on current user's role
  const activeSteps = useMemo(() => {
    const userRole = (user?.role || 'owner') as 'owner' | 'manager' | 'cashier' | 'employee';
    return GUIDED_TOUR_STEPS.filter(step => {
      if (!step.roles) return true;
      return step.roles.includes(userRole);
    });
  }, [user?.role]);

  const totalSteps = activeSteps.length;
  const currentStepDef = activeSteps[tourStep] || null;
  const isFirstStep = tourStep === 0;
  const isLastStep = tourStep >= totalSteps - 1;

  // ─── Dual Persistence: AsyncStorage + SQLite (keyed per user.id) ────────────
  const userStorageKey = useMemo(() => {
    return user ? `${STORAGE_PREFIX}${user.id}` : null;
  }, [user?.id]);

  // Load tour status when user logs in
  useEffect(() => {
    if (loading || !user || !userStorageKey) {
      if (!loading && !user) {
        setHasCheckedStatus(true);
        setTourModalState('idle');
      }
      return;
    }

    let isMounted = true;

    const checkAndInitTour = async () => {
      try {
        let recordedStatus: 'completed' | 'skipped' | 'not_started' | null = null;

        // 1. Check local AsyncStorage
        const localRaw = await AsyncStorage.getItem(userStorageKey);
        if (localRaw) {
          try {
            const parsed = JSON.parse(localRaw) as UserTourPersistedState;
            if (parsed.status === 'completed' || parsed.status === 'skipped') {
              recordedStatus = parsed.status;
            }
          } catch {}
        }

        // 2. Fallback to SQLite table if not found in AsyncStorage
        if (!recordedStatus) {
          try {
            const sqliteRecord = await sqlite.getUserTourStatus(user.id);
            if (sqliteRecord && (sqliteRecord.status === 'completed' || sqliteRecord.status === 'skipped')) {
              recordedStatus = sqliteRecord.status;
              // Sync back to AsyncStorage
              await AsyncStorage.setItem(userStorageKey, JSON.stringify(sqliteRecord));
            }
          } catch (e) {
            console.warn('[OnboardingContext] SQLite tour status read error:', e);
          }
        }

        if (!isMounted) return;

        if (recordedStatus === 'completed' || recordedStatus === 'skipped') {
          setTourStatus(recordedStatus);
          setHasCheckedStatus(true);
          setTourModalState('idle');
        } else {
          // Brand new user / first login: show Welcome modal after dashboard settles
          setTourStatus('not_started');
          setHasCheckedStatus(true);

          // Give the dashboard 900ms to mount before displaying the welcome modal
          const timer = setTimeout(() => {
            if (isMounted) {
              setTourModalState('welcome');
            }
          }, 900);
          return () => clearTimeout(timer);
        }
      } catch (err) {
        console.warn('[OnboardingContext] Error verifying tour status:', err);
        if (isMounted) setHasCheckedStatus(true);
      }
    };

    checkAndInitTour();

    return () => {
      isMounted = false;
    };
  }, [user, loading, userStorageKey]);

  // Helper to persist status
  const persistStatus = useCallback(
    async (status: 'completed' | 'skipped') => {
      if (!user || !userStorageKey) return;
      const now = new Date().toISOString();
      const record: UserTourPersistedState = {
        userId: user.id,
        status,
        version: '2.0',
        completedAt: status === 'completed' ? now : undefined,
        skippedAt: status === 'skipped' ? now : undefined,
        updatedAt: now,
      };

      setTourStatus(status);

      try {
        await AsyncStorage.setItem(userStorageKey, JSON.stringify(record));
      } catch (e) {
        console.warn('[OnboardingContext] AsyncStorage write error:', e);
      }

      try {
        await sqlite.setUserTourStatus(user.id, status, '2.0');
      } catch (e) {
        console.warn('[OnboardingContext] SQLite write error:', e);
      }
    },
    [user, userStorageKey]
  );

  // ─── Actions ────────────────────────────────────────────────────────────────
  const startTour = useCallback(() => {
    setTourStep(0);
    setTourModalState('touring');
  }, []);

  const advanceTour = useCallback(() => {
    setTourStep(prev => {
      if (prev >= totalSteps - 1) {
        // Final step finished: Open Completion modal
        setTourModalState('completed');
        return prev;
      }
      return prev + 1;
    });
  }, [totalSteps]);

  const rewindTour = useCallback(() => {
    setTourStep(prev => Math.max(0, prev - 1));
  }, []);

  const skipTour = useCallback(() => {
    setTourModalState('idle');
    persistStatus('skipped');
  }, [persistStatus]);

  const finishTour = useCallback(() => {
    setTourModalState('idle');
    persistStatus('completed');
  }, [persistStatus]);

  const restartTour = useCallback(() => {
    setTourStep(0);
    setTourModalState('touring');
  }, []);

  const closeTourModal = useCallback(() => {
    setTourModalState('idle');
  }, []);

  // ─── Legacy Checklist Compatibility (to avoid breaking any legacy references) ─
  const [checklistVisible, setChecklistVisible] = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(true);
  const [checklistCompleted, setChecklistCompleted] = useState<Record<string, boolean>>({});

  const markStepComplete = useCallback((id: string) => {
    setChecklistCompleted(prev => ({ ...prev, [id]: true }));
  }, []);

  const skipStep = useCallback((id: string) => {
    markStepComplete(id);
  }, [markStepComplete]);

  const dismissChecklist = useCallback(() => {
    setChecklistVisible(false);
    setChecklistDismissed(true);
  }, []);

  const openChecklist = useCallback(() => {
    setChecklistVisible(true);
  }, []);

  const tourActive = tourModalState === 'touring';
  const tourSeen = tourStatus === 'completed' || tourStatus === 'skipped';

  return (
    <OnboardingContext.Provider
      value={{
        tourModalState,
        tourStep,
        activeSteps,
        currentStepDef,
        totalSteps,
        isFirstStep,
        isLastStep,
        tourStatus,
        hasCheckedStatus,

        startTour,
        advanceTour,
        rewindTour,
        skipTour,
        finishTour,
        restartTour,
        closeTourModal,

        tourActive,
        tourSeen,
        endTour: skipTour,
        replayTour: restartTour,

        checklistVisible,
        checklistCompleted,
        checklistDismissed,
        markStepComplete,
        skipStep,
        dismissChecklist,
        openChecklist,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextType {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return ctx;
}
