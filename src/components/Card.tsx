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
    if (pressed && onPress) return '0 1px 3px rgba(0,0,0,0.08)';
    if (hoverable && hovered) return '0 14px 28px -4px rgba(0,0,0,0.12), 0 4px 12px -2px rgba(0,0,0,0.06)';
    return '0 2px 6px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)';
  };

  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={({ pressed }: any) => [
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: hoverable && hovered ? (theme.primary ? theme.primary + '55' : '#C5A88070') : (theme.border || '#EAECEF'),
          borderWidth: 1,
          borderRadius: 18,
        },
        Platform.select({
          web: {
            boxShadow: getShadow(pressed),
            transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            transform: pressed && onPress ? 'scale(0.985)' : hoverable && hovered ? 'translateY(-3px)' : 'none',
            cursor: onPress ? 'pointer' : 'default',
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
