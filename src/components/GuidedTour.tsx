import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOnboarding } from '../context/OnboardingContext';
import { useThemeContext } from '../context/ThemeContext';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export function GuidedTour() {
  const {
    tourModalState,
    tourStep,
    activeSteps,
    currentStepDef,
    totalSteps,
    isFirstStep,
    isLastStep,
    startTour,
    advanceTour,
    rewindTour,
    skipTour,
    finishTour,
  } = useOnboarding();

  const { theme, isDark } = useThemeContext();
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const badgeBounceAnim = useRef(new Animated.Value(0.9)).current;

  // Pulse animation for spotlight ring
  useEffect(() => {
    if (tourModalState === 'touring') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [tourModalState]);

  // Entrance transition for modals & tooltips
  useEffect(() => {
    if (tourModalState !== 'idle') {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.94);
      badgeBounceAnim.setValue(0.7);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
        Animated.timing(badgeBounceAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.back(2)),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [tourModalState, tourStep]);

  // Locate, scroll into view, and measure target DOM element
  const measureTarget = useCallback(() => {
    if (Platform.OS !== 'web' || !currentStepDef) {
      setTargetRect(null);
      return;
    }

    const tid = currentStepDef.targetId;
    const el =
      document.getElementById(tid) ||
      document.querySelector(`[data-testid="${tid}"]`) ||
      document.querySelector(`[nativeid="${tid}"]`) ||
      document.querySelector(`[id="${tid}"]`);

    if (el) {
      const freshRect = el.getBoundingClientRect();
      setTargetRect({
        top: Math.max(0, freshRect.top),
        left: Math.max(0, freshRect.left),
        width: Math.max(40, freshRect.width),
        height: Math.max(30, freshRect.height),
        bottom: freshRect.bottom,
        right: freshRect.right,
      });
    } else {
      setTargetRect(null);
    }
  }, [currentStepDef]);

  // Track target on step change and auto-scroll
  useEffect(() => {
    if (tourModalState === 'touring' && currentStepDef) {
      if (Platform.OS === 'web') {
        const tid = currentStepDef.targetId;
        const el =
          document.getElementById(tid) ||
          document.querySelector(`[data-testid="${tid}"]`) ||
          document.querySelector(`[nativeid="${tid}"]`) ||
          document.querySelector(`[id="${tid}"]`);

        if (el && typeof el.scrollIntoView === 'function') {
          const isSidebarOrTop =
            tid === 'tour-nav-menu' ||
            tid === 'tour-sidebar' ||
            tid === 'tour-pos' ||
            tid === 'tour-settings' ||
            tid === 'tour-search' ||
            tid === 'tour-metrics';

          el.scrollIntoView({
            behavior: 'smooth',
            block: isSidebarOrTop ? 'start' : 'center',
            inline: 'nearest',
          });
        }
      }

      measureTarget();
      const t1 = setTimeout(measureTarget, 100);
      const t2 = setTimeout(measureTarget, 300);

      const handleUpdate = () => measureTarget();
      if (Platform.OS === 'web') {
        window.addEventListener('resize', handleUpdate);
        window.addEventListener('scroll', handleUpdate, true);
      }

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        if (Platform.OS === 'web') {
          window.removeEventListener('resize', handleUpdate);
          window.removeEventListener('scroll', handleUpdate, true);
        }
      };
    } else {
      setTargetRect(null);
    }
  }, [tourModalState, tourStep, currentStepDef, measureTarget]);

  // Keyboard Navigation: Esc to exit, Arrows / Enter to navigate
  useEffect(() => {
    if (Platform.OS !== 'web' || tourModalState === 'idle') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        skipTour();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (tourModalState === 'welcome') {
          e.preventDefault();
          startTour();
        } else if (tourModalState === 'touring') {
          e.preventDefault();
          advanceTour();
        } else if (tourModalState === 'completed') {
          e.preventDefault();
          finishTour();
        }
      } else if (e.key === 'ArrowLeft') {
        if (tourModalState === 'touring' && !isFirstStep) {
          e.preventDefault();
          rewindTour();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tourModalState, isFirstStep, startTour, advanceTour, rewindTour, skipTour, finishTour]);

  if (tourModalState === 'idle') return null;

  const winW = Dimensions.get('window').width;
  const winH = Dimensions.get('window').height;

  // ─── 1. Welcome Modal ────────────────────────────────────────────────────────
  if (tourModalState === 'welcome') {
    return (
      <View style={styles.fullscreenOverlay}>
        <View style={styles.dimmedBackdrop} />
        <Animated.View
          style={[
            styles.welcomeCard,
            {
              backgroundColor: isDark ? '#161922' : '#FFFFFF',
              borderColor: isDark ? 'rgba(197, 168, 128, 0.35)' : 'rgba(197, 168, 128, 0.4)',
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Header Luxury Icon */}
          <View style={styles.welcomeIconWrapper}>
            <View style={styles.welcomeIconInner}>
              <Ionicons name="sparkles" size={24} color="#16171B" />
            </View>
          </View>

          <Text style={[styles.welcomeTitle, { color: isDark ? '#FAF7F2' : '#0F172A' }]}>
            Welcome to Vaypar
          </Text>
          <Text style={[styles.welcomeSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            Your complete POS, billing, and retail management workspace is configured and ready to power your business.
          </Text>

          {/* Quick Value Highlights */}
          <View style={styles.welcomePillsContainer}>
            <View style={[styles.featurePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#E2E8F0' }]}>
              <View style={[styles.pillIconBubble, { backgroundColor: 'rgba(34, 197, 94, 0.12)' }]}>
                <Ionicons name="receipt-outline" size={16} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featurePillTitle, { color: theme.text }]}>Instant POS & Thermal Printing</Text>
                <Text style={[styles.featurePillDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>Fast checkout, barcode scanning, and 80mm/58mm slip printing.</Text>
              </View>
            </View>

            <View style={[styles.featurePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#E2E8F0' }]}>
              <View style={[styles.pillIconBubble, { backgroundColor: 'rgba(37, 211, 102, 0.12)' }]}>
                <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featurePillTitle, { color: theme.text }]}>WhatsApp PDF Invoices</Text>
                <Text style={[styles.featurePillDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>Direct customer chat dispatch with PDF receipts in one click.</Text>
              </View>
            </View>

            <View style={[styles.featurePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#E2E8F0' }]}>
              <View style={[styles.pillIconBubble, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                <Ionicons name="bar-chart-outline" size={16} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featurePillTitle, { color: theme.text }]}>Live Financial Metrics</Text>
                <Text style={[styles.featurePillDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>Real-time sales tracking, cashflow waves, and stock reorder alerts.</Text>
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.welcomeActionRow}>
            <TouchableOpacity
              style={[styles.skipWelcomeBtn, { borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? 'transparent' : '#F1F5F9' }]}
              onPress={skipTour}
              activeOpacity={0.75}
            >
              <Text style={[styles.skipWelcomeBtnText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Skip for Now
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.startTourBtn, { backgroundColor: '#C5A880' }]}
              onPress={startTour}
              activeOpacity={0.85}
            >
              <Text style={styles.startTourBtnText}>Start Tour</Text>
              <Ionicons name="arrow-forward" size={16} color="#16171B" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    );
  }

  // ─── 2. Completion Modal (Professional, Adorable, Luxury) ────────────────────
  if (tourModalState === 'completed') {
    return (
      <View style={styles.fullscreenOverlay}>
        <View style={styles.dimmedBackdrop} />
        <Animated.View
          style={[
            styles.completionCard,
            {
              backgroundColor: isDark ? '#161922' : '#FFFFFF',
              borderColor: isDark ? 'rgba(197, 168, 128, 0.35)' : 'rgba(197, 168, 128, 0.45)',
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Adorable Luxury Celebration Badge */}
          <Animated.View
            style={[
              styles.celebrationBadgeContainer,
              { transform: [{ scale: badgeBounceAnim }] },
            ]}
          >
            {/* Soft radiant aura */}
            <View
              style={[
                styles.badgeAmbientGlow,
                { backgroundColor: isDark ? 'rgba(197, 168, 128, 0.18)' : 'rgba(197, 168, 128, 0.25)' },
              ]}
            />

            {/* Concentric Halo Ring */}
            <View
              style={[
                styles.badgeOuterRing,
                {
                  borderColor: isDark ? 'rgba(197, 168, 128, 0.4)' : 'rgba(197, 168, 128, 0.5)',
                  backgroundColor: isDark ? 'rgba(197, 168, 128, 0.08)' : 'rgba(197, 168, 128, 0.12)',
                },
              ]}
            >
              <View style={[styles.badgeInnerCore, { backgroundColor: '#C5A880' }]}>
                <Ionicons name="sparkles" size={26} color="#16171B" />
              </View>
            </View>

            {/* Cute floating micro-sparkles */}
            <View style={[styles.floatingSparkle, { top: 0, right: 2 }]}>
              <Ionicons name="star" size={14} color="#C5A880" />
            </View>
            <View style={[styles.floatingSparkle, { bottom: 6, left: 0 }]}>
              <Ionicons name="star" size={11} color="#C5A880" />
            </View>
          </Animated.View>

          {/* User Requested Exact Title & Message */}
          <Text style={[styles.completionTitle, { color: isDark ? '#FAF7F2' : '#0F172A' }]}>
            Congratulations! You’re ready to go.
          </Text>
          <Text style={[styles.completionMessage, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            You’ve explored the essentials. Start using your workspace with confidence.
          </Text>

          {/* Adorable Mini Capability Checklist */}
          <View style={styles.readinessContainer}>
            <View
              style={[
                styles.readinessRow,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#F8FAFC',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : '#E2E8F0',
                },
              ]}
            >
              <View style={styles.checkIconBubble}>
                <Ionicons name="checkmark" size={13} color="#10B981" />
              </View>
              <Text style={[styles.readinessText, { color: isDark ? '#E2E8F0' : '#334155' }]}>
                POS Terminal & Thermal Printing Configured
              </Text>
            </View>

            <View
              style={[
                styles.readinessRow,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#F8FAFC',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : '#E2E8F0',
                },
              ]}
            >
              <View style={styles.checkIconBubble}>
                <Ionicons name="checkmark" size={13} color="#10B981" />
              </View>
              <Text style={[styles.readinessText, { color: isDark ? '#E2E8F0' : '#334155' }]}>
                Real-Time SQLite Financial Metrics Active
              </Text>
            </View>
          </View>

          {/* Hint Box */}
          <View
            style={[
              styles.completionTipCard,
              {
                backgroundColor: isDark ? 'rgba(197, 168, 128, 0.08)' : '#FFFBEB',
                borderColor: isDark ? 'rgba(197, 168, 128, 0.25)' : 'rgba(197, 168, 128, 0.35)',
              },
            ]}
          >
            <Ionicons name="compass-outline" size={16} color="#C5A880" style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 12, color: theme.text, flex: 1, lineHeight: 18 }}>
              Need a refresher later? Restart anytime in <Text style={{ fontWeight: '700' }}>Settings → Help & Guided Tour</Text>.
            </Text>
          </View>

          {/* User Requested Exact Button ("Let's Get Started") */}
          <TouchableOpacity
            style={[styles.getStartedBtn, { backgroundColor: '#C5A880' }]}
            onPress={finishTour}
            activeOpacity={0.85}
          >
            <Text style={styles.getStartedBtnText}>Let’s Get Started</Text>
            <Ionicons name="arrow-forward" size={17} color="#16171B" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // ─── 3. Interactive Step Spotlight & Tooltip ─────────────────────────────────
  if (!currentStepDef) return null;

  // Calculate Tooltip Coordinates & Arrow Positioning
  const tooltipWidth = Math.min(380, winW - 32);
  const estimatedTooltipHeight = 260;
  let tooltipStyle: any = {};
  let arrowDirection: 'up' | 'down' | 'left' | 'right' | 'none' = 'none';
  let arrowOffset = 24;

  if (targetRect) {
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    // Check if target is in the left sidebar (e.g. Menu, POS, Settings)
    const isLeftSidebarTarget = targetRect.left < 280 && winW > 768;

    if (isLeftSidebarTarget && winW - targetRect.right >= tooltipWidth + 24) {
      // Place to the RIGHT of sidebar
      const left = targetRect.right + 20;
      const top = Math.max(16, Math.min(winH - estimatedTooltipHeight - 16, targetCenterY - estimatedTooltipHeight / 2));
      tooltipStyle = { top, left };
      arrowDirection = 'left';
      arrowOffset = Math.max(20, Math.min(estimatedTooltipHeight - 40, targetCenterY - top - 9));
    } else {
      // Elements in the main body (Search bar, KPI cards, Chart, Inventory)
      const spaceBelow = winH - targetRect.bottom;
      const spaceAbove = targetRect.top;
      const spaceRight = winW - targetRect.right;
      const spaceLeft = targetRect.left;

      if (spaceBelow >= estimatedTooltipHeight + 20) {
        // Place BELOW target
        const top = targetRect.bottom + 18;
        let left = targetRect.left + 20;
        left = Math.max(16, Math.min(winW - tooltipWidth - 16, left));
        tooltipStyle = { top, left };
        arrowDirection = 'up';
        arrowOffset = Math.max(24, Math.min(tooltipWidth - 40, targetCenterX - left - 9));
      } else if (spaceAbove >= estimatedTooltipHeight + 20) {
        // Place ABOVE target
        const top = targetRect.top - estimatedTooltipHeight - 18;
        let left = targetRect.left + 20;
        left = Math.max(16, Math.min(winW - tooltipWidth - 16, left));
        tooltipStyle = { top, left };
        arrowDirection = 'down';
        arrowOffset = Math.max(24, Math.min(tooltipWidth - 40, targetCenterX - left - 9));
      } else if (spaceRight >= tooltipWidth + 24) {
        // Place to the RIGHT
        const left = targetRect.right + 20;
        const top = Math.max(16, Math.min(winH - estimatedTooltipHeight - 16, targetCenterY - estimatedTooltipHeight / 2));
        tooltipStyle = { top, left };
        arrowDirection = 'left';
        arrowOffset = Math.max(20, Math.min(estimatedTooltipHeight - 40, targetCenterY - top - 9));
      } else if (spaceLeft >= tooltipWidth + 24) {
        // Place to the LEFT
        const left = targetRect.left - tooltipWidth - 20;
        const top = Math.max(16, Math.min(winH - estimatedTooltipHeight - 16, targetCenterY - estimatedTooltipHeight / 2));
        tooltipStyle = { top, left };
        arrowDirection = 'right';
        arrowOffset = Math.max(20, Math.min(estimatedTooltipHeight - 40, targetCenterY - top - 9));
      } else {
        // Fallback below
        const top = Math.max(16, Math.min(winH - estimatedTooltipHeight - 16, targetRect.bottom + 14));
        const left = Math.max(16, (winW - tooltipWidth) / 2);
        tooltipStyle = { top, left };
        arrowDirection = 'none';
      }
    }
  } else {
    // Centered fallback when element is temporarily off screen
    tooltipStyle = {
      top: Math.max(20, (winH - estimatedTooltipHeight) / 2),
      left: Math.max(16, (winW - tooltipWidth) / 2),
    };
    arrowDirection = 'none';
  }

  const progressPercent = Math.round(((tourStep + 1) / totalSteps) * 100);

  return (
    <View style={styles.fullscreenOverlay} pointerEvents="box-none">
      {/* Dimmed backdrop with smooth SVG cutout hole for the marked feature */}
      {Platform.OS === 'web' && targetRect ? (
        <svg
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 99998,
          } as any}
        >
          <defs>
            <mask id="vaypar-tour-spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect
                x={Math.max(0, targetRect.left - 6)}
                y={Math.max(0, targetRect.top - 6)}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx={14}
                ry={14}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(10, 15, 26, 0.78)"
            mask="url(#vaypar-tour-spotlight-mask)"
          />
        </svg>
      ) : (
        <View style={styles.dimmedBackdrop} pointerEvents="none" />
      )}

      {/* Prominently Marked Feature Frame & Clean Badge Pin (No 📍 emoji!) */}
      {targetRect && (
        <View
          pointerEvents="none"
          style={[
            styles.featureMarkBox,
            {
              top: targetRect.top - 6,
              left: targetRect.left - 6,
              width: targetRect.width + 12,
              height: targetRect.height + 12,
            },
          ]}
        >
          {/* Animated pulse halo */}
          <Animated.View
            style={[
              styles.targetPulseHalo,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />

          {/* Clean, Professional Step Badge (No 📍 emoji!) */}
          <View style={styles.beaconPin}>
            <View style={styles.beaconRadarDot} />
            <Text style={styles.beaconPinText}>
              STEP {tourStep + 1} · {currentStepDef.badge.toUpperCase()}
            </Text>
          </View>
        </View>
      )}

      {/* Floating Tooltip with Directional Pointer Arrow */}
      <Animated.View
        style={[
          styles.tooltipWrapper,
          tooltipStyle,
          {
            width: tooltipWidth,
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Real Directional Triangle Arrow pointing directly at marked feature */}
        {arrowDirection === 'left' && (
          <View
            style={[
              styles.arrowLeft,
              {
                borderRightColor: isDark ? '#161922' : '#FFFFFF',
                top: arrowOffset,
              },
            ]}
          />
        )}
        {arrowDirection === 'right' && (
          <View
            style={[
              styles.arrowRight,
              {
                borderLeftColor: isDark ? '#161922' : '#FFFFFF',
                top: arrowOffset,
              },
            ]}
          />
        )}
        {arrowDirection === 'up' && (
          <View
            style={[
              styles.arrowUp,
              {
                borderBottomColor: isDark ? '#161922' : '#FFFFFF',
                left: arrowOffset,
              },
            ]}
          />
        )}
        {arrowDirection === 'down' && (
          <View
            style={[
              styles.arrowDown,
              {
                borderTopColor: isDark ? '#161922' : '#FFFFFF',
                left: arrowOffset,
              },
            ]}
          />
        )}

        <View
          style={[
            styles.tooltipCard,
            {
              backgroundColor: isDark ? '#161922' : '#FFFFFF',
              borderColor: isDark ? 'rgba(197, 168, 128, 0.45)' : 'rgba(197, 168, 128, 0.5)',
            },
          ]}
        >
          {/* Progress Bar Line */}
          <View style={[styles.progressBarTrack, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%`, backgroundColor: '#C5A880' }]} />
          </View>

          {/* Top Header Row */}
          <View style={styles.tooltipHeaderRow}>
            <View style={styles.tooltipBadgeRow}>
              <View style={[styles.stepPill, { backgroundColor: 'rgba(197, 168, 128, 0.18)' }]}>
                <Text style={styles.stepPillText}>
                  Step {tourStep + 1} of {totalSteps}
                </Text>
              </View>
              <View style={[styles.categoryPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
                <Text style={[styles.categoryPillText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  {currentStepDef.badge}
                </Text>
              </View>
            </View>

            {/* Exit / Skip icon */}
            <TouchableOpacity
              style={styles.closeTourBtn}
              onPress={skipTour}
              accessibilityLabel="Exit Tour"
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color={isDark ? '#888E9B' : '#94A3B8'} />
            </TouchableOpacity>
          </View>

          {/* Body content */}
          <View style={styles.tooltipBody}>
            <View style={styles.titleIconRow}>
              <View style={[styles.stepIconBubble, { backgroundColor: 'rgba(197, 168, 128, 0.15)' }]}>
                <Ionicons name={currentStepDef.icon as any} size={18} color="#C5A880" />
              </View>
              <Text style={[styles.tooltipTitle, { color: isDark ? '#FAF7F2' : '#0F172A' }]}>
                {currentStepDef.title}
              </Text>
            </View>

            <Text style={[styles.tooltipDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {currentStepDef.description}
            </Text>

            {currentStepDef.tip && (
              <View style={[styles.tipBanner, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0' }]}>
                <Ionicons name="information-circle-outline" size={14} color="#C5A880" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', flex: 1, lineHeight: 15 }}>
                  {currentStepDef.tip}
                </Text>
              </View>
            )}
          </View>

          {/* Bottom Nav Controls */}
          <View style={styles.tooltipNavRow}>
            {!isFirstStep ? (
              <TouchableOpacity
                style={[styles.backBtn, { borderColor: isDark ? '#334155' : '#CBD5E1', backgroundColor: isDark ? 'transparent' : '#F8FAFC' }]}
                onPress={rewindTour}
                activeOpacity={0.75}
              >
                <Ionicons name="chevron-back" size={15} color={isDark ? '#FAF7F2' : '#0F172A'} />
                <Text style={[styles.backBtnText, { color: isDark ? '#FAF7F2' : '#0F172A' }]}>Back</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={skipTour} style={styles.skipTextBtn}>
                <Text style={styles.skipText}>Skip Tour</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: '#C5A880' }]}
              onPress={advanceTour}
              activeOpacity={0.85}
            >
              <Text style={styles.nextBtnText}>{isLastStep ? 'Finish' : 'Next'}</Text>
              <Ionicons
                name={isLastStep ? 'checkmark' : 'chevron-forward'}
                size={15}
                color="#16171B"
              />
            </TouchableOpacity>
          </View>

          {/* Keyboard shortcut hint */}
          <View style={styles.keyboardHintRow}>
            <Text style={styles.keyboardHintText}>
              Esc to exit • Enter or → for next
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  fullscreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
  },
  dimmedBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 15, 26, 0.78)',
  },

  // ── Marked Feature Frame & Beacon Pin (No 📍 icon) ─────────────────────────
  featureMarkBox: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: '#C5A880',
    backgroundColor: 'transparent',
    zIndex: 99999,
    ...Platform.select({
      web: {
        boxShadow: '0 0 0 4px rgba(197, 168, 128, 0.25), 0 0 25px rgba(197, 168, 128, 0.55)',
      } as any,
      default: {
        shadowColor: '#C5A880',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 10,
      },
    }),
  },
  targetPulseHalo: {
    position: 'absolute',
    inset: -6,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(197, 168, 128, 0.5)',
    backgroundColor: 'transparent',
  },
  beaconPin: {
    position: 'absolute',
    top: -14,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#C5A880',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 10,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
      } as any,
    }),
  },
  beaconRadarDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16171B',
  },
  beaconPinText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#16171B',
    letterSpacing: 0.6,
  },

  // ── Welcome Modal ──────────────────────────────────────────────────────────
  welcomeCard: {
    alignSelf: 'center',
    marginHorizontal: 16,
    marginTop: 'auto',
    marginBottom: 'auto',
    maxWidth: 500,
    width: '92%',
    borderRadius: 28,
    borderWidth: 1.5,
    padding: 26,
    ...Platform.select({
      web: {
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.65)',
      } as any,
    }),
  },
  welcomeIconWrapper: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(197, 168, 128, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(197, 168, 128, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  welcomeIconInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#C5A880',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 20,
  },
  welcomePillsContainer: {
    gap: 10,
    marginBottom: 24,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  pillIconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  featurePillTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  featurePillDesc: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  welcomeActionRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  skipWelcomeBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipWelcomeBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  startTourBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 20px -4px rgba(197, 168, 128, 0.45)',
      } as any,
    }),
  },
  startTourBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#16171B',
  },

  // ── Completion Modal (Professional, Adorable, Luxury) ────────────────────────
  completionCard: {
    alignSelf: 'center',
    marginHorizontal: 16,
    marginTop: 'auto',
    marginBottom: 'auto',
    maxWidth: 460,
    width: '92%',
    borderRadius: 28,
    borderWidth: 1.5,
    padding: 28,
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.65)',
      } as any,
    }),
  },
  celebrationBadgeContainer: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  badgeAmbientGlow: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 39,
  },
  badgeOuterRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInnerCore: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 6px 16px rgba(197, 168, 128, 0.4)',
      } as any,
    }),
  },
  floatingSparkle: {
    position: 'absolute',
  },
  completionTitle: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 8,
  },
  completionMessage: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 380,
  },
  readinessContainer: {
    width: '100%',
    gap: 8,
    marginBottom: 16,
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  checkIconBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readinessText: {
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  completionTipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 22,
    width: '100%',
  },
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px -4px rgba(197, 168, 128, 0.45)',
      } as any,
    }),
  },
  getStartedBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#16171B',
  },

  // ── Tooltip Wrapper & Arrows ───────────────────────────────────────────────
  tooltipWrapper: {
    position: 'absolute',
    zIndex: 100000,
    overflow: 'visible',
  },
  tooltipCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 18,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 45px rgba(0, 0, 0, 0.65)',
      } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 15,
      },
    }),
  },
  arrowLeft: {
    position: 'absolute',
    left: -10,
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderTopColor: 'transparent',
    borderBottomWidth: 9,
    borderBottomColor: 'transparent',
    borderRightWidth: 10,
    borderLeftWidth: 0,
    zIndex: 100001,
  },
  arrowRight: {
    position: 'absolute',
    right: -10,
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderTopColor: 'transparent',
    borderBottomWidth: 9,
    borderBottomColor: 'transparent',
    borderLeftWidth: 10,
    borderRightWidth: 0,
    zIndex: 100001,
  },
  arrowUp: {
    position: 'absolute',
    top: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderLeftColor: 'transparent',
    borderRightWidth: 9,
    borderRightColor: 'transparent',
    borderBottomWidth: 10,
    borderTopWidth: 0,
    zIndex: 100001,
  },
  arrowDown: {
    position: 'absolute',
    bottom: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderLeftColor: 'transparent',
    borderRightWidth: 9,
    borderRightColor: 'transparent',
    borderTopWidth: 10,
    borderBottomWidth: 0,
    zIndex: 100001,
  },

  progressBarTrack: {
    height: 3,
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  progressBarFill: {
    height: 3,
  },
  tooltipHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  tooltipBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  stepPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#C5A880',
    letterSpacing: 0.2,
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryPillText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  closeTourBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipBody: {
    marginBottom: 16,
  },
  titleIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  stepIconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  tooltipDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 10,
  },
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  tooltipNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  skipTextBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: 12,
    color: '#888E9B',
    fontWeight: '600',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    marginLeft: 'auto',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px -2px rgba(197, 168, 128, 0.4)',
      } as any,
    }),
  },
  nextBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#16171B',
  },
  keyboardHintRow: {
    marginTop: 10,
    alignItems: 'center',
  },
  keyboardHintText: {
    fontSize: 10,
    color: '#525866',
    fontWeight: '500',
  },
});
