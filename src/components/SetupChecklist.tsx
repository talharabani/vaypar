/**
 * SetupChecklist
 *
 * A full-screen animated modal overlay shown to new users right after
 * registration. Walks them through 6 setup steps and auto-detects
 * completion from live app data (products, staff, logo).
 *
 * Triggered and dismissed via OnboardingContext.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  CHECKLIST_STEPS,
  ChecklistStepId,
  useOnboarding,
} from '../context/OnboardingContext';
import { useTheme } from '../hooks/use-theme';
import { useAuth } from '../context/AuthContext';
import { useDatabase } from '../context/DatabaseContext';
import * as sqlite from '../services/sqlite';

// ─── Auto-Detection of completed steps ───────────────────────────────────────

function useAutoCompleteSteps() {
  const { user } = useAuth();
  const { products } = useDatabase();
  const { markStepComplete, checklistCompleted } = useOnboarding();
  const [staffCount, setStaffCount] = useState(0);

  // Load staff count once
  useEffect(() => {
    if (!user?.businessId) return;
    sqlite.getAllUserProfiles()
      .then(profiles => {
        // Count non-owner profiles (actual employees)
        const employees = profiles.filter(
          p => p.businessId === user.businessId && p.role !== 'owner'
        );
        setStaffCount(employees.length);
      })
      .catch(() => {});
  }, [user?.businessId]);

  useEffect(() => {
    // Account is always created if we're logged in
    if (user && !checklistCompleted.account_created) {
      markStepComplete('account_created');
    }
    // Logo uploaded
    if (user?.logoUri && !checklistCompleted.upload_logo) {
      markStepComplete('upload_logo');
    }
    // First employee added
    if (staffCount > 0 && !checklistCompleted.add_employee) {
      markStepComplete('add_employee');
    }
    // First product added
    if (products && products.length > 0 && !checklistCompleted.add_product) {
      markStepComplete('add_product');
    }
  }, [user, products, staffCount, checklistCompleted, markStepComplete]);
}

// ─── Step Row ────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: (typeof CHECKLIST_STEPS)[number];
  completed: boolean;
  isCurrent: boolean;
  onPress: () => void;
  onSkip: () => void;
  index: number;
}

function StepRow({ step, completed, isCurrent, onPress, onSkip, index }: StepRowProps) {
  const theme = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        delay: index * 70,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 320,
        delay: index * 70,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const dotColor = completed
    ? theme.success
    : isCurrent
    ? theme.primary
    : theme.border;

  return (
    <Animated.View
      style={[
        styles.stepRow,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          backgroundColor: isCurrent
            ? theme.primary + '08'
            : completed
            ? theme.success + '06'
            : 'transparent',
          borderColor: isCurrent
            ? theme.primary + '30'
            : completed
            ? theme.success + '20'
            : theme.border,
        },
      ]}
    >
      {/* Status dot / icon */}
      <View
        style={[
          styles.stepDot,
          { backgroundColor: dotColor + (completed ? '' : '20'), borderColor: dotColor },
        ]}
      >
        {completed ? (
          <Ionicons name="checkmark" size={14} color="#FFF" />
        ) : isCurrent ? (
          <View style={[styles.innerDot, { backgroundColor: theme.primary }]} />
        ) : (
          <View style={[styles.innerDot, { backgroundColor: theme.border }]} />
        )}
      </View>

      {/* Step info */}
      <View style={styles.stepInfo}>
        <Text
          style={[
            styles.stepLabel,
            {
              color: completed ? theme.textSecondary : theme.text,
              textDecorationLine: completed ? 'line-through' : 'none',
            },
          ]}
        >
          {step.label}
        </Text>
        <Text style={[styles.stepDesc, { color: theme.textSecondary }]} numberOfLines={1}>
          {step.description}
        </Text>
      </View>

      {/* Action */}
      {!completed && step.route && (
        <View style={styles.stepActions}>
          {step.skippable && (
            <TouchableOpacity
              style={[styles.skipBtn, { borderColor: theme.border }]}
              onPress={onSkip}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.skipBtnText, { color: theme.textSecondary }]}>Skip</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.goBtn, { backgroundColor: isCurrent ? theme.primary : theme.backgroundSelected }]}
            onPress={onPress}
          >
            <Ionicons
              name="arrow-forward"
              size={14}
              color={isCurrent ? '#FFF' : theme.textSecondary}
            />
          </TouchableOpacity>
        </View>
      )}

      {completed && (
        <View style={[styles.completedBadge, { backgroundColor: theme.success + '15' }]}>
          <Text style={[styles.completedBadgeText, { color: theme.success }]}>Done</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SetupChecklist() {
  const theme = useTheme();
  const router = useRouter();
  const {
    checklistVisible,
    checklistCompleted,
    skipStep,
    dismissChecklist,
    startTour,
  } = useOnboarding();

  // Auto-mark steps based on live data
  useAutoCompleteSteps();

  // Progress calculation
  const totalSteps = CHECKLIST_STEPS.length;
  const completedCount = Object.values(checklistCompleted).filter(Boolean).length;
  const progressFraction = completedCount / totalSteps;
  const allDone = completedCount === totalSteps;

  // Animated progress bar
  const progressAnim = useRef(new Animated.Value(0)).current;
  const headerAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (checklistVisible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }),
        Animated.timing(headerAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [checklistVisible]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressFraction,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progressFraction]);

  // Find first incomplete step
  const firstIncompleteIndex = CHECKLIST_STEPS.findIndex(
    s => !checklistCompleted[s.id]
  );

  const handleComplete = () => {
    dismissChecklist();
    startTour();
  };

  return (
    <Modal
      visible={checklistVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismissChecklist}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
              transform: [{ scale: scaleAnim }],
              ...Platform.select({
                web: {
                  boxShadow: `0 32px 80px rgba(0,0,0,0.4)`,
                } as any,
                default: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 24 },
                  shadowOpacity: 0.32,
                  shadowRadius: 40,
                  elevation: 24,
                },
              }),
            },
          ]}
        >
          {/* Header gradient strip */}
          <View style={[styles.headerStrip, { backgroundColor: theme.primary }]}>
            <Animated.View style={{ opacity: headerAnim }}>
              <Text style={styles.headerTitle}>Welcome to Vaypar!</Text>
              <Text style={styles.headerSub}>
                Let's set up your business in under 3 minutes.
              </Text>
            </Animated.View>

            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={styles.progressLabel}>
              {completedCount} of {totalSteps} steps complete
            </Text>
          </View>

          {/* Steps list */}
          <ScrollView
            style={styles.stepsScroll}
            contentContainerStyle={styles.stepsContent}
            showsVerticalScrollIndicator={false}
          >
            {CHECKLIST_STEPS.map((step, index) => (
              <StepRow
                key={step.id}
                step={step}
                completed={checklistCompleted[step.id]}
                isCurrent={index === firstIncompleteIndex}
                index={index}
                onPress={() => {
                  if (step.route) {
                    router.push(step.route as any);
                    dismissChecklist();
                  }
                }}
                onSkip={() => skipStep(step.id as ChecklistStepId)}
              />
            ))}

            {/* Complete / CTA */}
            {allDone ? (
              <TouchableOpacity
                style={[styles.cta, { backgroundColor: theme.success }]}
                onPress={handleComplete}
                activeOpacity={0.85}
              >
                <Ionicons name="rocket" size={18} color="#FFF" />
                <Text style={styles.ctaText}>Start App Tour</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.cta, { backgroundColor: theme.primary }]}
                onPress={() => {
                  const next = CHECKLIST_STEPS[firstIncompleteIndex];
                  if (next?.route) {
                    router.push(next.route as any);
                    dismissChecklist();
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-forward-circle" size={18} color="#FFF" />
                <Text style={styles.ctaText}>
                  Continue: {CHECKLIST_STEPS[firstIncompleteIndex]?.label ?? 'Next Step'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={dismissChecklist} style={styles.laterBtn}>
              <Text style={[styles.laterBtnText, { color: theme.textSecondary }]}>
                I'll finish this later
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '88%',
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // Header
  headerStrip: {
    padding: 24,
    paddingBottom: 20,
  },
  headerEmoji: {
    fontSize: 36,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFF',
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
    marginBottom: 18,
    fontWeight: '500',
  },
  progressTrack: {
    height: 7,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFF',
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    marginTop: 2,
  },

  // Steps
  stepsScroll: { flex: 1 },
  stepsContent: { padding: 16, gap: 8, paddingBottom: 28 },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  innerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepInfo: { flex: 1 },
  stepLabel: { fontSize: 14, fontWeight: '700' },
  stepDesc: { fontSize: 11, fontWeight: '500', marginTop: 2 },

  stepActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  skipBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  skipBtnText: { fontSize: 11, fontWeight: '600' },
  goBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  completedBadgeText: { fontSize: 11, fontWeight: '800' },

  // CTA
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 16,
    marginTop: 8,
  },
  ctaText: { fontSize: 15, fontWeight: '800', color: '#FFF' },

  laterBtn: { alignItems: 'center', paddingVertical: 12 },
  laterBtnText: { fontSize: 13, fontWeight: '500' },
});
