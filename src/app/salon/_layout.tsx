import { Stack } from 'expo-router';

export default function SalonLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="book" />
      <Stack.Screen name="services" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
