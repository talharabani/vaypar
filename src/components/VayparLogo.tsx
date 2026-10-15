import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../hooks/use-theme';

interface VayparLogoProps {
  size?: number;
  showText?: boolean;
  textVariant?: 'standard' | 'stacked' | 'none';
  color?: string;
  dotColor?: string;
  textColor?: string;
  style?: any;
}

export function VayparLogo({
  size = 32,
  showText = true,
  textVariant = 'standard',
  color,
  dotColor,
  textColor,
  style,
}: VayparLogoProps) {
  const theme = useTheme();

  // Use champagne gold #C5A880 by default to match the app theme, or custom color
  const primaryBrandColor = color || '#C5A880';
  const secondaryDotColor = dotColor || primaryBrandColor;
  const brandTextColor = textColor || (theme?.text ? theme.text : '#FFFFFF');

  const iconWidth = size;
  const iconHeight = size;

  return (
    <View style={[styles.container, style]}>
      {/* ── Geometric Brand Emblem Mark ── */}
      <View style={{ width: iconWidth, height: iconHeight, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={iconWidth} height={iconHeight} viewBox="0 0 64 64" fill="none">
          <Defs>
            <LinearGradient id="vayparGrad" x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#DFD2BF" />
              <Stop offset="50%" stopColor={primaryBrandColor} />
              <Stop offset="100%" stopColor="#A88B60" />
            </LinearGradient>
          </Defs>

          {/* Stylized Modern V-Prism Polygon */}
          <Path
            d="M 18 10 H 48 C 53.5 10 56.5 13.5 56.5 19 V 28 C 56.5 35 53 41.5 48 45.5 L 34.5 54 C 29.5 57 24 55 21 50 L 10 24 C 7.5 18 11.5 10 18 10 Z"
            fill="url(#vayparGrad)"
          />

          {/* Offset Geometric Anchor Dot */}
          <Circle cx="10.5" cy="51" r="5" fill="url(#vayparGrad)" />
        </Svg>
      </View>

      {/* ── Brand Typography ── */}
      {showText && textVariant === 'standard' && (
        <View style={styles.textContainer}>
          <Text
            style={[
              styles.brandNameText,
              {
                color: brandTextColor,
                fontSize: Math.max(16, size * 0.58),
              },
            ]}
          >
            vaypar
          </Text>
        </View>
      )}

      {showText && textVariant === 'stacked' && (
        <View style={styles.textContainerStacked}>
          <Text
            style={[
              styles.brandNameTextStacked,
              {
                color: brandTextColor,
                fontSize: Math.max(14, size * 0.5),
              },
            ]}
          >
            vaypar
          </Text>
          <Text style={[styles.subTextStacked, { color: primaryBrandColor }]}>
            POS & RETAIL
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  textContainer: {
    justifyContent: 'center',
  },
  brandNameText: {
    fontWeight: '800',
    letterSpacing: -0.5,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    textTransform: 'lowercase',
  },
  textContainerStacked: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  brandNameTextStacked: {
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 18,
    textTransform: 'lowercase',
  },
  subTextStacked: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 1,
  },
});
