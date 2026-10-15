import { Stack } from 'expo-router';
import { useTheme } from '../../hooks/use-theme';

export default function GymLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="new-member" />
      <Stack.Screen name="plans" />
      <Stack.Screen name="attendance" />
      <Stack.Screen name="member/[id]" />
    </Stack>
  );
}
