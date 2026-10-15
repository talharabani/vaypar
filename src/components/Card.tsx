import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/use-theme';

interface CardProps {
  children: React.ReactNode;
  style?: any;
  variant?: 'flat' | 'elevated' | 'bordered';
  hoverable?: boolean;
  onPress?: () => void;
  [key: string]: any;
}

export function Card({ children, style, variant = 'elevated', hoverable = true, onPress, ...rest }: CardProps) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);

  const getShadow = (pressed: boolean) => {
    if (variant === 'flat') return 'none';
    if (pressed && onPress) return '0 1px 3px rgba(0,0,0,0.06)';
    if (hoverable && hovered) return '0 8px 24px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.03)';
    return '0 1px 4px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.02)';
  };

  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }: any) => [
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: '#EAECEF',
          borderWidth: 1,
          borderRadius: 18,
        },
        Platform.select({
          web: {
            boxShadow: getShadow(pressed),
            transition: 'box-shadow 0.2s ease, transform 0.15s ease, border-color 0.2s ease',
            transform: pressed && onPress ? 'scale(0.99)' : hoverable && hovered && onPress ? 'translateY(-2px)' : 'none',
          } as any,
          default: pressed && onPress ? { transform: [{ scale: 0.99 }] } : {},
        }),
        style,
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, marginVertical: 6 },
});
