import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/use-theme';

interface BusinessLogoProps {
  size?: number;
  borderRadius?: number;
  fontSize?: number;
}

export function BusinessLogo({ size = 40, borderRadius, fontSize = 16 }: BusinessLogoProps) {
  const { user } = useAuth();
  const theme = useTheme();

  const businessName = user?.businessName || 'Vaypar';
  const logoUri = user?.logoUri;
  const initials = businessName.charAt(0).toUpperCase();

  const radius = borderRadius !== undefined ? borderRadius : size / 2;

  if (logoUri) {
    return (
      <Image
        source={{ uri: logoUri }}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: theme.backgroundElement,
        }}
        resizeMode="cover"
      />
    );
  }

  // Fallback Initials Gradient avatar
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: theme.primary,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      }}
    >
      <Text style={{ color: '#FFF', fontSize, fontWeight: '800' }}>{initials}</Text>
    </View>
  );
}
