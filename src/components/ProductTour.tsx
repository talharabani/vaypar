/**
 * ProductTour
 *
 * A coordinate-based spotlight overlay that highlights real UI regions
 * one at a time with an animated pulsing ring and tooltip bubble.
 *
 * The tour renders over the entire screen using absolute positioning
 * (zIndex 9999). Spotlight positions are expressed as fractions of the
 * device screen dimensions so they work on any screen size.
 *
 * Users can navigate with Prev / Next / Skip or tap the backdrop.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOUR_STEPS, useOnboarding } from '../context/OnboardingContext';
import { useTheme } from '../hooks/use-theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Spotlight "Hole" Component ───────────────────────────────────────────────

interface SpotlightProps {
  cx: number; // centre x in px
  cy: number; // centre y in px
  w: number;  // width in px
  h: number;  // height in px
}

function SpotlightHole({ cx, cy, w, h }: SpotlightProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const cornerRadius = Math.min(w, h) * 0.22;

  return (
    <>
      {/* Dark backdrop split into 4 rectangles around the spotlight */}
      {/* Top */}
      <View
        pointerEvents="none"
        style={[styles.backdropSlice, { top: 0, left: 0, right: 0, height: cy - h / 2 }]}
      />
      {/* Bottom */}
      <View
        pointerEvents="none"
        style={[
          styles.backdropSlice,
          { top: cy + h / 2, left: 0, right: 0, bottom: 0 },
        ]}
      />
      {/* Left */}
      <View
        pointerEvents="none"
        style={[
          styles.backdropSlice,
          {
            top: cy - h / 2,
            left: 0,
            width: cx - w / 2,
            height: h,
          },
        ]}
      />
      {/* Right */}
      <View
        pointerEvents="none"
        style={[
          styles.backdropSlice,
          {
            top: cy - h / 2,
            left: cx + w / 2,
            right: 0,
            height: h,
          },
        ]}
      />

      {/* Pulsing highlight ring */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulseRing,
          {
            position: 'absolute',
            left: cx - w / 2 - 4,
            top: cy - h / 2 - 4,
            width: w + 8,
            height: h + 8,
            borderRadius: cornerRadius + 4,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />
    </>
  );
}

// ─── Tooltip Bubble ───────────────────────────────────────────────────────────

interface TooltipProps {
  step: (typeof TOUR_STEPS)[number];
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  cx: number;
  cy: number;
  spotH: number;
}

function TooltipBubble({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  cx,
  cy,
  spotH,
}: TooltipProps) {
  const theme = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(step.tooltipAnchor === 'top' ? 12 : -12)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(step.tooltipAnchor === 'top' ? 12 : -12);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 120, friction: 14 }),
    ]).start();
  }, [stepIndex]);

  // Position the tooltip above or below the spotlight
  const TOOLTIP_H = 190;
  const TOOLTIP_W = Math.min(SCREEN_W - 40, 380);
  const MARGIN = 16;

  let tooltipTop: number;
  let arrowBottom: boolean;

  if (step.tooltipAnchor === 'top') {
    // Tooltip above spotlight
    tooltipTop = cy - spotH / 2 - TOOLTIP_H - MARGIN;
    arrowBottom = true;
  } else if (step.tooltipAnchor === 'bottom') {
    // Tooltip below spotlight
    tooltipTop = cy + spotH / 2 + MARGIN;
    arrowBottom = false;
  } else {
    tooltipTop = (SCREEN_H - TOOLTIP_H) / 2;
    arrowBottom = false;
  }

  // Keep on-screen
  tooltipTop = Math.max(48, Math.min(tooltipTop, SCREEN_H - TOOLTIP_H - 24));
  const tooltipLeft = Math.max(20, Math.min(cx - TOOLTIP_W / 2, SCREEN_W - TOOLTIP_W - 20));

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  return (
    <Animated.View
      style={[
        styles.tooltip,
        {
          top: tooltipTop,
          left: tooltipLeft,
          width: TOOLTIP_W,
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          ...Platform.select({
            web: {
              boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px ${theme.border}`,
            } as any,
            default: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.4,
              shadowRadius: 24,
              elevation: 20,
            },
          }),
        },
      ]}
    >
      {/* Arrow pointer */}
      {arrowBottom ? (
        <View style={[styles.arrowDown, { borderTopColor: theme.backgroundElement }]} />
      ) : (
        <View style={[styles.arrowUp, { borderBottomColor: theme.backgroundElement }]} />
      )}

      {/* Content */}
      <View style={styles.tooltipInner}>
        {/* Step indicator */}
        <View style={styles.tooltipTopRow}>
          <View style={[styles.stepBadge, { backgroundColor: theme.primary + '20' }]}>
            <Text style={[styles.stepBadgeText, { color: theme.primary }]}>
              {stepIndex + 1} / {totalSteps}
            </Text>
          </View>
          <TouchableOpacity onPress={onSkip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.tooltipEmoji]}>{step.emoji}</Text>
        <Text style={[styles.tooltipTitle, { color: theme.text }]}>{step.title}</Text>
        <Text style={[styles.tooltipDesc, { color: theme.textSecondary }]}>
          {step.description}
        </Text>

        {/* Navigation */}
        <View style={styles.tooltipNav}>
          <TouchableOpacity
            style={[
              styles.navBtn,
              {
                backgroundColor: theme.backgroundSelected,
                opacity: isFirst ? 0.3 : 1,
              },
            ]}
            onPress={onPrev}
            disabled={isFirst}
          >
            <Ionicons name="chevron-back" size={16} color={theme.text} />
            <Text style={[styles.navBtnText, { color: theme.text }]}>Prev</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navBtn, { backgroundColor: theme.primary, flex: 1.5 }]}
            onPress={onNext}
          >
            <Text style={[styles.navBtnText, { color: '#FFF' }]}>
              {isLast ? 'Finish Tour' : 'Next'}
            </Text>
            {!isLast && <Ionicons name="chevron-forward" size={16} color="#FFF" />}
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProductTour() {
  const { tourActive, tourStep, advanceTour, rewindTour, endTour } = useOnboarding();

  if (!tourActive) return null;

  const step = TOUR_STEPS[tourStep];
  if (!step) return null;

  // Compute pixel coords from fractions
  const cx = step.spotlightX * SCREEN_W;
  const cy = step.spotlightY * SCREEN_H;
  const w  = step.spotlightW * SCREEN_W;
  const h  = step.spotlightH * SCREEN_H;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Spotlight backdrop (4 slices) */}
      <SpotlightHole cx={cx} cy={cy} w={w} h={h} />

      {/* Tooltip */}
      <TooltipBubble
        step={step}
        stepIndex={tourStep}
        totalSteps={TOUR_STEPS.length}
        cx={cx}
        cy={cy}
        spotH={h}
        onNext={advanceTour}
        onPrev={rewindTour}
        onSkip={endTour}
      />

      {/* Tap-to-skip on backdrop */}
      <TouchableWithoutFeedback onPress={advanceTour}>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-only" />
      </TouchableWithoutFeedback>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  backdropSlice: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  pulseRing: {
    borderWidth: 2.5,
    borderColor: '#6D5DF6',
    ...Platform.select({
      web: {
        boxShadow: '0 0 0 6px rgba(109,93,246,0.18), 0 0 24px rgba(109,93,246,0.35)',
      } as any,
      default: {
        shadowColor: '#6D5DF6',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
        elevation: 12,
      },
    }),
  },

  // Tooltip
  tooltip: {
    position: 'absolute',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'visible',
    zIndex: 10000,
  },
  arrowDown: {
    position: 'absolute',
    bottom: -10,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  arrowUp: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tooltipInner: { padding: 18 },
  tooltipTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  stepBadgeText: { fontSize: 12, fontWeight: '800' },
  tooltipEmoji: { fontSize: 28, marginBottom: 6 },
  tooltipTitle: { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  tooltipDesc: { fontSize: 13, lineHeight: 20, fontWeight: '500', marginBottom: 14 },

  // Nav
  tooltipNav: { flexDirection: 'row', gap: 8 },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 11,
    borderRadius: 13,
  },
  navBtnText: { fontSize: 14, fontWeight: '800' },
});
