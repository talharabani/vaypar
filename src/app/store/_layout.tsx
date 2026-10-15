import { Stack } from 'expo-router';

// Public store — no auth, no sidebar, clean layout
export default function StoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    />
  );
}
