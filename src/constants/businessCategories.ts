/**
 * Master Business Category Configuration
 *
 * Each category defines:
 *   - modules[]       → which feature modules are enabled
 *   - dashboardWidgets[] → ordered list of widget keys shown on the dashboard
 *   - navTabs[]       → which bottom tabs to show (maps to expo-router tab screen names)
 */

export type BusinessCategoryId =
  | 'general'
  | 'restaurant'
  | 'cafe'
  | 'dhaba'
  | 'bakery'
  | 'sweet_shop'
  | 'grocery'
  | 'supermarket'
  | 'pharmacy'
  | 'medical_store'
  | 'clothing_boutique'
  | 'tailor'
  | 'shoe_store'
  | 'watch_shop'
  | 'perfume_store'
  | 'mobile_shop'
  | 'mobile_repair'
  | 'solar'
  | 'tyre_shop'
  | 'auto_workshop'
  | 'real_estate'
  | 'beauty_salon'
  | 'spa'
  | 'wedding_hall'
  | 'event_management'
  | 'gym'
  | 'fitness_center'
  | 'electronics_store'
  | 'hardware_store'
  | 'book_shop'
  | 'stationery'
  | 'pet_shop'
  | 'dairy'
  | 'juice_bar'
  | 'coffee_shop'
  | 'clinic';

export type DashboardWidget =
  | 'sales_today'
  | 'bills_today'
  | 'catalog_items'
  | 'net_profit'
  | 'active_tables'
  | 'kitchen_queue'
  | 'pending_orders'
  | 'low_stock'
  | 'credit_outstanding'
  | 'due_members'
  | 'appointments_today'
  | 'orders_in_progress'
  | 'expiry_alerts'
  | 'stock_value'
  | 'members_active'
  | 'attendance_today'
  | 'deliveries_today'
  | 'trials_today'
  | 'bookings_today'
  | 'staff_on_duty';

export type NavTab =
  | 'index'
  | 'revenue'
  | 'products'
  | 'bills'
  | 'expenses'
  | 'staff'
  | 'activity'
  | 'settings'
  | 'restaurant'
  | 'udhar'
  | 'grocery'
  | 'pharmacy'
  | 'tailor'
  | 'gym'
  | 'salon'
  | 'crm'
  | 'queue'
  | 'warranty';

export interface BusinessCategory {
  id: BusinessCategoryId;
  label: string;
  emoji: string;
  description: string;
  group: string;
  modules: string[];
  dashboardWidgets: DashboardWidget[];
  navTabs: NavTab[];
}

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  // ─── Food & Beverage ─────────────────────────────────────────────────────
  {
    id: 'restaurant',
    label: 'Restaurant',
    emoji: '🍽️',
    description: 'Full-service dine-in restaurant',
    group: 'Food & Beverage',
    modules: ['restaurant', 'pos', 'products', 'staff', 'expenses', 'udhar', 'queue'],
    dashboardWidgets: ['active_tables', 'kitchen_queue', 'sales_today', 'bills_today', 'pending_orders', 'staff_on_duty'],
    navTabs: ['index', 'restaurant', 'queue', 'bills', 'expenses', 'staff', 'settings'],
  },
  {
    id: 'cafe',
    label: 'Cafe',
    emoji: '☕',
    description: 'Coffee shop & café',
    group: 'Food & Beverage',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'catalog_items', 'net_profit', 'staff_on_duty'],
    navTabs: ['index', 'products', 'bills', 'expenses', 'staff', 'settings'],
  },
  {
    id: 'dhaba',
    label: 'Dhaba',
    emoji: '🥘',
    description: 'Roadside eatery / dhaba',
    group: 'Food & Beverage',
    modules: ['restaurant', 'pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['active_tables', 'sales_today', 'bills_today', 'pending_orders', 'credit_outstanding'],
    navTabs: ['index', 'restaurant', 'bills', 'expenses', 'udhar', 'settings'],
  },
  {
    id: 'bakery',
    label: 'Bakery',
    emoji: '🎂',
    description: 'Bakery & sweets',
    group: 'Food & Beverage',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'low_stock', 'credit_outstanding', 'net_profit'],
    navTabs: ['index', 'products', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'sweet_shop',
    label: 'Sweet Shop',
    emoji: '🍬',
    description: 'Mithai & sweets store',
    group: 'Food & Beverage',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'low_stock', 'credit_outstanding'],
    navTabs: ['index', 'products', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'juice_bar',
    label: 'Juice Bar',
    emoji: '🥤',
    description: 'Fresh juice & drinks',
    group: 'Food & Beverage',
    modules: ['pos', 'products', 'staff', 'expenses'],
    dashboardWidgets: ['sales_today', 'bills_today', 'catalog_items', 'net_profit'],
    navTabs: ['index', 'products', 'bills', 'expenses', 'settings'],
  },
  {
    id: 'coffee_shop',
    label: 'Coffee Shop',
    emoji: '☕',
    description: 'Specialty coffee & beverages',
    group: 'Food & Beverage',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'catalog_items', 'net_profit'],
    navTabs: ['index', 'products', 'bills', 'expenses', 'settings'],
  },

  // ─── Retail ──────────────────────────────────────────────────────────────
  {
    id: 'grocery',
    label: 'Grocery Store',
    emoji: '🛒',
    description: 'Kiryana / general store',
    group: 'Retail',
    modules: ['grocery', 'pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'low_stock', 'credit_outstanding', 'stock_value', 'expiry_alerts'],
    navTabs: ['index', 'grocery', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'supermarket',
    label: 'Supermarket',
    emoji: '🏪',
    description: 'Large retail / supermarket',
    group: 'Retail',
    modules: ['grocery', 'pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'low_stock', 'credit_outstanding', 'stock_value'],
    navTabs: ['index', 'grocery', 'bills', 'udhar', 'expenses', 'staff', 'settings'],
  },
  {
    id: 'clothing_boutique',
    label: 'Clothing Boutique',
    emoji: '👗',
    description: 'Fashion & clothing store',
    group: 'Retail',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'low_stock', 'credit_outstanding', 'net_profit'],
    navTabs: ['index', 'products', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'shoe_store',
    label: 'Shoe Store',
    emoji: '👟',
    description: 'Footwear retail',
    group: 'Retail',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'low_stock', 'credit_outstanding'],
    navTabs: ['index', 'products', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'watch_shop',
    label: 'Watch Shop',
    emoji: '⌚',
    description: 'Watches & accessories',
    group: 'Retail',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'catalog_items', 'credit_outstanding'],
    navTabs: ['index', 'products', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'perfume_store',
    label: 'Perfume Store',
    emoji: '🌸',
    description: 'Fragrances & cosmetics',
    group: 'Retail',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'catalog_items', 'credit_outstanding'],
    navTabs: ['index', 'products', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'electronics_store',
    label: 'Electronics Store',
    emoji: '🖥️',
    description: 'Electronics & appliances',
    group: 'Retail',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar', 'warranty'],
    dashboardWidgets: ['sales_today', 'bills_today', 'low_stock', 'credit_outstanding', 'net_profit'],
    navTabs: ['index', 'products', 'warranty', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'hardware_store',
    label: 'Hardware Store',
    emoji: '🔧',
    description: 'Tools & building materials',
    group: 'Retail',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'low_stock', 'credit_outstanding'],
    navTabs: ['index', 'products', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'book_shop',
    label: 'Book Shop',
    emoji: '📚',
    description: 'Books & reading material',
    group: 'Retail',
    modules: ['pos', 'products', 'staff', 'expenses'],
    dashboardWidgets: ['sales_today', 'bills_today', 'catalog_items', 'net_profit'],
    navTabs: ['index', 'products', 'bills', 'expenses', 'settings'],
  },
  {
    id: 'stationery',
    label: 'Stationery Shop',
    emoji: '✏️',
    description: 'Stationery & office supplies',
    group: 'Retail',
    modules: ['pos', 'products', 'staff', 'expenses'],
    dashboardWidgets: ['sales_today', 'bills_today', 'low_stock', 'net_profit'],
    navTabs: ['index', 'products', 'bills', 'expenses', 'settings'],
  },
  {
    id: 'pet_shop',
    label: 'Pet Shop',
    emoji: '🐾',
    description: 'Pets & pet supplies',
    group: 'Retail',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'low_stock', 'credit_outstanding'],
    navTabs: ['index', 'products', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'dairy',
    label: 'Dairy / Milk Shop',
    emoji: '🥛',
    description: 'Milk, dairy & daily deliveries',
    group: 'Retail',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'credit_outstanding', 'deliveries_today', 'net_profit'],
    navTabs: ['index', 'products', 'bills', 'udhar', 'expenses', 'settings'],
  },

  // ─── Health & Medical ────────────────────────────────────────────────────
  {
    id: 'pharmacy',
    label: 'Pharmacy',
    emoji: '💊',
    description: 'Pharmacy & medicine store',
    group: 'Health & Medical',
    modules: ['pharmacy', 'pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'expiry_alerts', 'low_stock', 'credit_outstanding'],
    navTabs: ['index', 'pharmacy', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'medical_store',
    label: 'Medical Store',
    emoji: '🏥',
    description: 'Medical supplies & equipment',
    group: 'Health & Medical',
    modules: ['pharmacy', 'pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'expiry_alerts', 'low_stock', 'credit_outstanding'],
    navTabs: ['index', 'pharmacy', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'clinic',
    label: 'Medical Clinic',
    emoji: '🩺',
    description: 'Doctors clinic & diagnostics',
    group: 'Health & Medical',
    modules: ['queue', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['appointments_today', 'sales_today', 'staff_on_duty'],
    navTabs: ['index', 'queue', 'bills', 'expenses', 'staff', 'settings'],
  },

  // ─── Fashion & Personal ──────────────────────────────────────────────────
  {
    id: 'tailor',
    label: 'Tailor Shop',
    emoji: '🧵',
    description: 'Stitching & custom clothing',
    group: 'Fashion & Personal',
    modules: ['tailor', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['orders_in_progress', 'deliveries_today', 'trials_today', 'sales_today', 'credit_outstanding'],
    navTabs: ['index', 'tailor', 'expenses', 'udhar', 'staff', 'settings'],
  },

  // ─── Mobile & Tech ───────────────────────────────────────────────────────
  {
    id: 'mobile_shop',
    label: 'Mobile Shop',
    emoji: '📱',
    description: 'Mobile phones & accessories',
    group: 'Mobile & Tech',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar', 'warranty'],
    dashboardWidgets: ['sales_today', 'bills_today', 'credit_outstanding', 'low_stock'],
    navTabs: ['index', 'products', 'warranty', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'mobile_repair',
    label: 'Mobile Repair Shop',
    emoji: '🛠️',
    description: 'Mobile repair & servicing',
    group: 'Mobile & Tech',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar', 'warranty'],
    dashboardWidgets: ['orders_in_progress', 'sales_today', 'credit_outstanding', 'deliveries_today'],
    navTabs: ['index', 'products', 'warranty', 'bills', 'udhar', 'expenses', 'settings'],
  },

  // ─── Auto & Industrial ───────────────────────────────────────────────────
  {
    id: 'tyre_shop',
    label: 'Tyre Shop',
    emoji: '🚗',
    description: 'Tyres & automotive parts',
    group: 'Auto & Industrial',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['sales_today', 'bills_today', 'credit_outstanding', 'low_stock'],
    navTabs: ['index', 'products', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'auto_workshop',
    label: 'Auto Workshop',
    emoji: '🔩',
    description: 'Car repair & garage',
    group: 'Auto & Industrial',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar'],
    dashboardWidgets: ['orders_in_progress', 'sales_today', 'credit_outstanding', 'deliveries_today'],
    navTabs: ['index', 'products', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'solar',
    label: 'Solar Shop',
    emoji: '☀️',
    description: 'Solar panels & installations',
    group: 'Auto & Industrial',
    modules: ['pos', 'products', 'staff', 'expenses', 'udhar', 'warranty'],
    dashboardWidgets: ['sales_today', 'orders_in_progress', 'low_stock', 'credit_outstanding'],
    navTabs: ['index', 'products', 'warranty', 'bills', 'udhar', 'expenses', 'settings'],
  },

  // ─── Real Estate ─────────────────────────────────────────────────────────
  {
    id: 'real_estate',
    label: 'Real Estate Agency',
    emoji: '🏠',
    description: 'Property buying, selling & rental',
    group: 'Real Estate',
    modules: ['pos', 'staff', 'expenses'],
    dashboardWidgets: ['sales_today', 'net_profit', 'staff_on_duty', 'bookings_today'],
    navTabs: ['index', 'bills', 'expenses', 'staff', 'settings'],
  },

  // ─── Beauty & Wellness ───────────────────────────────────────────────────
  {
    id: 'beauty_salon',
    label: 'Beauty Salon',
    emoji: '💄',
    description: 'Hair, makeup & beauty services',
    group: 'Beauty & Wellness',
    modules: ['salon', 'pos', 'products', 'staff', 'expenses', 'udhar', 'queue'],
    dashboardWidgets: ['appointments_today', 'sales_today', 'staff_on_duty', 'credit_outstanding'],
    navTabs: ['index', 'salon', 'queue', 'bills', 'udhar', 'expenses', 'settings'],
  },
  {
    id: 'spa',
    label: 'Spa',
    emoji: '🧖',
    description: 'Spa & relaxation services',
    group: 'Beauty & Wellness',
    modules: ['salon', 'pos', 'products', 'staff', 'expenses', 'queue'],
    dashboardWidgets: ['appointments_today', 'sales_today', 'staff_on_duty', 'net_profit'],
    navTabs: ['index', 'salon', 'queue', 'bills', 'expenses', 'settings'],
  },

  // ─── Events & Hospitality ────────────────────────────────────────────────
  {
    id: 'wedding_hall',
    label: 'Wedding Hall',
    emoji: '💒',
    description: 'Event hall & banquet',
    group: 'Events & Hospitality',
    modules: ['pos', 'staff', 'expenses'],
    dashboardWidgets: ['bookings_today', 'sales_today', 'net_profit', 'staff_on_duty'],
    navTabs: ['index', 'bills', 'expenses', 'staff', 'settings'],
  },
  {
    id: 'event_management',
    label: 'Event Management',
    emoji: '🎉',
    description: 'Event planning & coordination',
    group: 'Events & Hospitality',
    modules: ['pos', 'staff', 'expenses'],
    dashboardWidgets: ['bookings_today', 'sales_today', 'orders_in_progress', 'staff_on_duty'],
    navTabs: ['index', 'bills', 'expenses', 'staff', 'settings'],
  },

  // ─── Fitness & Health ────────────────────────────────────────────────────
  {
    id: 'gym',
    label: 'Gym',
    emoji: '💪',
    description: 'Gymnasium & fitness center',
    group: 'Fitness & Health',
    modules: ['gym', 'staff', 'expenses'],
    dashboardWidgets: ['members_active', 'due_members', 'attendance_today', 'sales_today'],
    navTabs: ['index', 'gym', 'expenses', 'staff', 'settings'],
  },
  {
    id: 'fitness_center',
    label: 'Fitness Center',
    emoji: '🏋️',
    description: 'Multi-sport fitness facility',
    group: 'Fitness & Health',
    modules: ['gym', 'staff', 'expenses'],
    dashboardWidgets: ['members_active', 'due_members', 'attendance_today', 'sales_today'],
    navTabs: ['index', 'gym', 'expenses', 'staff', 'settings'],
  },

  // ─── General (fallback) ──────────────────────────────────────────────────
  {
    id: 'general',
    label: 'General Business',
    emoji: '🏢',
    description: 'General / other business',
    group: 'Other',
    modules: ['pos', 'products', 'staff', 'expenses'],
    dashboardWidgets: ['sales_today', 'bills_today', 'catalog_items', 'net_profit'],
    navTabs: ['index', 'products', 'bills', 'expenses', 'staff', 'settings'],
  },
];

/** Unique group names for UI rendering */
export const CATEGORY_GROUPS = Array.from(
  new Set(BUSINESS_CATEGORIES.map(c => c.group))
);

/** Lookup a category by ID — falls back to 'general' if unknown */
export function getCategoryById(id: BusinessCategoryId | string | undefined): BusinessCategory {
  return (
    BUSINESS_CATEGORIES.find(c => c.id === id) ??
    BUSINESS_CATEGORIES.find(c => c.id === 'general')!
  );
}
