import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/use-theme';
import { Platform } from 'react-native';

export default function RestaurantLayout() {
  const theme = useTheme();

  const isDark = theme.cardShadow === '#0F0E0D';
  const shadowDark = theme.cardShadow;
  const shadowLight = isDark ? '#23201E' : '#FFFFFF';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          position: Platform.OS === 'web' ? 'fixed' : 'absolute',
          bottom: Platform.OS === 'web' ? 24 : 16,
          left: Platform.OS === 'web' ? '50%' : 20,
          right: Platform.OS === 'web' ? 'auto' : 20,
          width: Platform.OS === 'web' ? 'min(92%, 580px)' : undefined,
          height: 66,
          backgroundColor: theme.backgroundElement,
          borderColor: 'transparent',
          borderWidth: 0,
          borderRadius: 33,
          paddingBottom: Platform.OS === 'ios' ? 12 : 8,
          paddingTop: 8,
          ...Platform.select({
            web: {
              boxShadow: `6px 6px 14px ${shadowDark}, -6px -6px 14px ${shadowLight}`,
              transform: 'translateX(-50%)',
              zIndex: 9999,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            } as any,
            default: {
              shadowColor: theme.cardShadow,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.12,
              shadowRadius: 20,
              elevation: 8,
            },
          }),
        },
        headerStyle: {
          backgroundColor: theme.backgroundElement,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          ...Platform.select({ web: {}, default: { shadowOpacity: 0, elevation: 0 } }),
        },
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 20 },
      }}
    >
      {/* 1. POS Tab: Sell Products */}
      <Tabs.Screen
        name="pos"
        options={{
          title: 'Sell Products POS',
          tabBarLabel: 'POS',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'cart' : 'cart-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* 2. Products Tab: Add & Manage Products */}
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Products & Menu',
          tabBarLabel: 'Products',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'restaurant' : 'restaurant-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* 3. Expenses Tab: Track Restaurant Operational Expenses */}
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Track Expenses',
          tabBarLabel: 'Expenses',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* 4. Salary Tab: Staff Roster & Salary Payouts */}
      <Tabs.Screen
        name="salary"
        options={{
          title: 'Staff & Salary',
          tabBarLabel: 'Salary',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* 5. Stats Tab: Dashboard Analytics */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Restaurant Stats',
          tabBarLabel: 'Stats',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={22} color={color} />
          ),
        }}
      />

      {/* Hide unused legacy kitchen and tables routes from tab bar */}
      <Tabs.Screen
        name="tables"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="kitchen"
        options={{
          href: null,
        }}
      />

      {/* 6. Exit Button */}
      <Tabs.Screen
        name="exit"
        options={{
          title: 'Exit to Hub',
          tabBarLabel: 'Exit',
          tabBarIcon: ({ color }) => (
            <Ionicons name="exit-outline" size={22} color="#EF4444" />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('index');
          },
        })}
      />
    </Tabs>
  );
}
