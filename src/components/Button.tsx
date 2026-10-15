import React, { useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacityProps,
    View,
} from 'react-native';
import { useTheme } from '../hooks/use-theme';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'primaryLight' | 'accent';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  title,
  variant = 'primary',
  size = 'medium',
  loading = false,
  icon,
  style,
  disabled,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);

  const getStyles = () => {
    switch (variant) {
      case 'accent':
        return { bg: theme.primary, text: '#FFFFFF', border: 'transparent', bw: 0 };
      case 'primary':
        return { bg: theme.primary, text: '#FFFFFF', border: 'transparent', bw: 0 };
      case 'primaryLight':
        return { bg: theme.primary + '18', text: theme.primary, border: theme.border, bw: 1 };
      case 'secondary':
        return { bg: theme.backgroundElement, text: theme.text, border: theme.border, bw: 1 };
      case 'outline':
        return { bg: 'transparent', text: theme.text, border: theme.border, bw: 1 };
      case 'ghost':
        return { bg: 'transparent', text: theme.text, border: 'transparent', bw: 0 };
      case 'danger':
        return { bg: theme.danger, text: '#FFFFFF', border: 'transparent', bw: 0 };
      default:
        return { bg: theme.primary, text: '#FFFFFF', border: 'transparent', bw: 0 };
    }
  };

  let { bg, text, border, bw } = getStyles();

  if (disabled || loading) {
    bg = variant === 'outline' || variant === 'ghost' ? 'transparent' : theme.border;
    text = theme.textSecondary;
    border = variant === 'outline' ? theme.border : 'transparent';
  }

  const py = size === 'small' ? 7 : size === 'large' ? 14 : 10;
  const px = size === 'small' ? 14 : size === 'large' ? 28 : 20;
  const fs = size === 'small' ? 13 : size === 'large' ? 16 : 14;

  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }: any) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: bw,
          paddingVertical: py,
          paddingHorizontal: px,
          borderRadius: 18,
          opacity: pressed ? 0.88 : 1,
        },
        Platform.select({
          web: {
            boxShadow: variant === 'accent' && !disabled && !loading
              ? hovered
                ? '0 6px 16px rgba(26,26,26,0.2)'
                : '0 1px 3px rgba(0,0,0,0.08)'
              : variant === 'primary' && !disabled && !loading
                ? hovered
                  ? '0 6px 16px rgba(22,23,27,0.25)'
                  : '0 1px 3px rgba(0,0,0,0.08)'
                : 'none',
            transition: 'all 0.15s ease',
            transform: pressed ? 'scale(0.98)' : hovered ? 'translateY(-1px)' : 'none',
            cursor: disabled || loading ? 'not-allowed' : 'pointer',
          } as any,
          default: pressed ? { transform: [{ scale: 0.97 }] } : {},
        }),
        style as any,
      ]}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={text} size="small" />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.icon}>{icon}</View>}
          <Text style={[styles.text, { color: text, fontSize: fs }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginVertical: 4,
    ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { marginRight: 7 },
  text: { fontWeight: '700', textAlign: 'center' },
});
