import { type Href, useRouter } from 'expo-router';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  INITIAL_HERO_TRANSITION_MODEL,
  isHeroGestureEnabled,
  isValidHeroRect,
  returnTransitionMode,
  shouldResetHeroOnRouteUnmount,
  transitionHeroModel,
  type HeroRect,
  type HeroTransitionEvent,
  type HeroTransitionModel,
} from './hero-transition-model';

const HERO_ANIMATION_DURATION_MS = 320;
// 问题定位完成后默认关闭诊断层，避免日志和调试样式干扰正常动画观感。
const HERO_DEBUG_ENABLED = false;
const OVERLAY_HANDOFF_DURATION_MS = 64;
const TARGET_READY_TIMEOUT_MS = 900;
const HERO_ANIMATION_WATCHDOG_MS = HERO_ANIMATION_DURATION_MS * 3;
const OVERLAY_HANDOFF_WATCHDOG_MS = OVERLAY_HANDOFF_DURATION_MS * 4;
const HERO_ANIMATION_CONFIG = {
  duration: HERO_ANIMATION_DURATION_MS,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
} as const;

interface ActiveHero {
  id: string;
  overlay: ReactNode;
}

type HandoffDirection = 'enter' | 'return';
type TransitionCompletionSource = 'ui' | 'watchdog';

function formatDebugRect(rect: HeroRect | null): string {
  if (!isValidHeroRect(rect)) {
    return 'none';
  }
  return [rect.x, rect.y, rect.width, rect.height]
    .map((value) => Math.round(value))
    .join(',');
}

interface StartHeroOptions {
  href: Href;
  id: string;
  overlay: ReactNode;
}

interface HeroTransitionContextValue {
  isBusy: boolean;
  isGestureEnabled: (id: string) => boolean;
  isHeroRouteActive: (id: string) => boolean;
  isSourceHidden: (id: string) => boolean;
  isTargetHidden: (id: string) => boolean;
  notifyTargetReady: (id: string) => void;
  registerSource: (id: string, node: View | null) => void;
  registerTarget: (id: string, node: View | null) => void;
  releaseHeroRoute: (id: string) => void;
  returnHero: (id: string) => void;
  startHero: (options: StartHeroOptions) => void;
}

const HeroTransitionContext = createContext<HeroTransitionContextValue | null>(
  null,
);

function measureView(node: View | null): Promise<HeroRect | null> {
  if (node === null) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      node.measureInWindow((x, y, width, height) => {
        const rect = { height, width, x, y };
        resolve(isValidHeroRect(rect) ? rect : null);
      });
    } catch {
      resolve(null);
    }
  });
}

interface HeroTransitionProviderProps {
  children: ReactNode;
}

export function HeroTransitionProvider({
  children,
}: HeroTransitionProviderProps): React.JSX.Element {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [model, setModel] = useState<HeroTransitionModel>(
    INITIAL_HERO_TRANSITION_MODEL,
  );
  const [activeHero, setActiveHero] = useState<ActiveHero | null>(null);
  const [debugEvents, setDebugEvents] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const modelRef = useRef(model);
  const debugStartedAtRef = useRef(Date.now());
  const sourceNodesRef = useRef(new Map<string, View>());
  const targetNodesRef = useRef(new Map<string, View>());
  const lockedRef = useRef(false);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(
    null,
  );
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const borderRadius = useSharedValue(8);
  const opacity = useSharedValue(0);

  // ref 负责同步阻止重复操作，state 负责让卡片在解锁后立即恢复可点击状态。
  const setTransitionLocked = useCallback((locked: boolean) => {
    lockedRef.current = locked;
    setIsBusy(locked);
  }, []);

  const debugLog = useCallback((event: string, details?: string) => {
    if (!HERO_DEBUG_ENABLED) {
      return;
    }
    const elapsed = Date.now() - debugStartedAtRef.current;
    const message = `+${elapsed}ms ${event}${details ? ` ${details}` : ''}`;
    console.info(`[HeroDebug] ${message}`);
    setDebugEvents((currentEvents) => [message, ...currentEvents].slice(0, 6));
  }, []);

  const applyEvent = useCallback(
    (event: HeroTransitionEvent) => {
      const previousModel = modelRef.current;
      const nextModel = transitionHeroModel(modelRef.current, event);
      modelRef.current = nextModel;
      setModel(nextModel);
      debugLog(
        `state-${event.type}`,
        `${previousModel.phase}->${nextModel.phase} id=${nextModel.activeId ?? 'none'}`,
      );
      return nextModel;
    },
    [debugLog],
  );

  const clearAnimationTimer = useCallback(() => {
    if (animationTimerRef.current !== null) {
      clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }
  }, []);

  const clearPendingWork = useCallback(() => {
    clearAnimationTimer();
    if (targetTimerRef.current !== null) {
      clearTimeout(targetTimerRef.current);
      targetTimerRef.current = null;
    }
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, [clearAnimationTimer]);

  const resetTransition = useCallback(() => {
    debugLog('reset');
    clearPendingWork();
    setActiveHero(null);
    setOverlayVisible(false);
    setTransitionLocked(false);
    opacity.value = 0;
    applyEvent({ type: 'reset' });
  }, [applyEvent, clearPendingWork, debugLog, opacity, setTransitionLocked]);

  const finishHandoff = useCallback(
    (
      direction: HandoffDirection,
      completionSource: TransitionCompletionSource,
    ) => {
      clearAnimationTimer();
      setOverlayVisible(false);
      if (direction === 'return') {
        setActiveHero(null);
      }
      setTransitionLocked(false);
      debugLog(
        'overlay-unmounted',
        `direction=${direction} source=${completionSource}`,
      );
    },
    [clearAnimationTimer, debugLog, setTransitionLocked],
  );

  const reportHandoffUiFinished = useCallback(
    (direction: HandoffDirection, finished: boolean | undefined) => {
      debugLog(
        'ui-handoff-finished',
        `direction=${direction} finished=${String(finished)}`,
      );
      if (finished) {
        finishHandoff(direction, 'ui');
      }
    },
    [debugLog, finishHandoff],
  );

  const handoffOverlay = useCallback(
    (direction: HandoffDirection) => {
      debugLog('handoff-scheduled', `direction=${direction}`);
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        debugLog('handoff-fade-start', `direction=${direction}`);

        // UI 线程才知道最后一帧何时真正完成，JS 定时器仅处理回调丢失等异常。
        animationTimerRef.current = setTimeout(() => {
          animationTimerRef.current = null;
          debugLog('handoff-watchdog-fired', `direction=${direction}`);
          finishHandoff(direction, 'watchdog');
        }, OVERLAY_HANDOFF_WATCHDOG_MS);
        opacity.value = withTiming(
          0,
          { duration: OVERLAY_HANDOFF_DURATION_MS },
          (finished) => {
            scheduleOnRN(reportHandoffUiFinished, direction, finished);
          },
        );
      });
    },
    [debugLog, finishHandoff, opacity, reportHandoffUiFinished],
  );

  const navigateBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);

  const finishEnterWithoutAnimation = useCallback(
    (id: string) => {
      if (
        modelRef.current.activeId !== id ||
        modelRef.current.phase !== 'waiting-target'
      ) {
        return;
      }

      applyEvent({ id, type: 'target-ready' });
      applyEvent({ id, type: 'enter-finished' });
      debugLog('target-timeout-fallback', `id=${id}`);
      handoffOverlay('enter');
    },
    [applyEvent, debugLog, handoffOverlay],
  );

  const finishEnterAnimation = useCallback(
    (id: string, completionSource: TransitionCompletionSource) => {
      if (
        modelRef.current.activeId !== id ||
        modelRef.current.phase !== 'entering'
      ) {
        return;
      }
      clearAnimationTimer();
      debugLog(
        'enter-animation-finished',
        `id=${id} source=${completionSource}`,
      );
      applyEvent({ id, type: 'enter-finished' });
      handoffOverlay('enter');
    },
    [applyEvent, clearAnimationTimer, debugLog, handoffOverlay],
  );

  const reportEnterUiFinished = useCallback(
    (id: string, finished: boolean | undefined) => {
      debugLog('ui-enter-finished', `id=${id} finished=${String(finished)}`);
      if (finished) {
        finishEnterAnimation(id, 'ui');
      }
    },
    [debugLog, finishEnterAnimation],
  );

  const startHero = useCallback(
    ({ href, id, overlay }: StartHeroOptions) => {
      if (lockedRef.current) {
        debugLog('enter-ignored-locked', `id=${id}`);
        return;
      }

      if (process.env.EXPO_OS === 'web' || reduceMotion) {
        debugLog('enter-without-hero', `id=${id}`);
        router.push(href);
        return;
      }

      debugStartedAtRef.current = Date.now();
      setDebugEvents([]);
      debugLog('enter-request', `id=${id}`);
      setTransitionLocked(true);
      void measureView(sourceNodesRef.current.get(id) ?? null).then(
        (sourceRect) => {
          debugLog(
            'source-measured',
            `id=${id} rect=${formatDebugRect(sourceRect)}`,
          );
          if (!isValidHeroRect(sourceRect)) {
            setTransitionLocked(false);
            router.push(href);
            return;
          }

          x.value = sourceRect.x;
          y.value = sourceRect.y;
          width.value = sourceRect.width;
          height.value = sourceRect.height;
          borderRadius.value = 8;
          opacity.value = 1;

          const nextActiveHero = { id, overlay };
          setActiveHero(nextActiveHero);
          setOverlayVisible(true);
          debugLog('overlay-mounted', `id=${id}`);
          applyEvent({ id, type: 'begin-enter' });

          frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            debugLog('router-push', `id=${id}`);
            router.push(href);
            targetTimerRef.current = setTimeout(() => {
              targetTimerRef.current = null;
              finishEnterWithoutAnimation(id);
            }, TARGET_READY_TIMEOUT_MS);
          });
        },
      );
    },
    [
      applyEvent,
      borderRadius,
      debugLog,
      finishEnterWithoutAnimation,
      height,
      opacity,
      reduceMotion,
      router,
      setTransitionLocked,
      width,
      x,
      y,
    ],
  );

  const notifyTargetReady = useCallback(
    (id: string) => {
      debugLog('target-layout', `id=${id} phase=${modelRef.current.phase}`);
      if (
        modelRef.current.activeId !== id ||
        modelRef.current.phase !== 'waiting-target'
      ) {
        return;
      }

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        void measureView(targetNodesRef.current.get(id) ?? null).then(
          (targetRect) => {
            debugLog(
              'target-measured',
              `id=${id} rect=${formatDebugRect(targetRect)}`,
            );
            if (
              !isValidHeroRect(targetRect) ||
              modelRef.current.activeId !== id ||
              modelRef.current.phase !== 'waiting-target'
            ) {
              return;
            }

            if (targetTimerRef.current !== null) {
              clearTimeout(targetTimerRef.current);
              targetTimerRef.current = null;
            }

            applyEvent({ id, type: 'target-ready' });
            debugLog('enter-animation-start', `id=${id}`);
            animationTimerRef.current = setTimeout(() => {
              animationTimerRef.current = null;
              debugLog('enter-watchdog-fired', `id=${id}`);
              finishEnterAnimation(id, 'watchdog');
            }, HERO_ANIMATION_WATCHDOG_MS);
            x.value = withTiming(targetRect.x, HERO_ANIMATION_CONFIG);
            y.value = withTiming(targetRect.y, HERO_ANIMATION_CONFIG);
            width.value = withTiming(targetRect.width, HERO_ANIMATION_CONFIG);
            height.value = withTiming(
              targetRect.height,
              HERO_ANIMATION_CONFIG,
              (finished) => {
                scheduleOnRN(reportEnterUiFinished, id, finished);
              },
            );
            borderRadius.value = withTiming(8, HERO_ANIMATION_CONFIG);
          },
        );
      });
    },
    [
      applyEvent,
      borderRadius,
      debugLog,
      finishEnterAnimation,
      height,
      reportEnterUiFinished,
      width,
      x,
      y,
    ],
  );

  const finishReturnAnimation = useCallback(
    (id: string, completionSource: TransitionCompletionSource) => {
      if (
        modelRef.current.activeId !== id ||
        modelRef.current.phase !== 'returning'
      ) {
        return;
      }
      clearAnimationTimer();
      debugLog(
        'return-animation-finished',
        `id=${id} source=${completionSource}`,
      );
      applyEvent({ id, type: 'return-finished' });
      handoffOverlay('return');
    },
    [applyEvent, clearAnimationTimer, debugLog, handoffOverlay],
  );

  const reportReturnUiFinished = useCallback(
    (id: string, finished: boolean | undefined) => {
      debugLog('ui-return-finished', `id=${id} finished=${String(finished)}`);
      if (finished) {
        finishReturnAnimation(id, 'ui');
      }
    },
    [debugLog, finishReturnAnimation],
  );

  const returnHero = useCallback(
    (id: string) => {
      if (lockedRef.current) {
        debugLog('return-ignored-locked', `id=${id}`);
        return;
      }

      if (
        process.env.EXPO_OS === 'web' ||
        reduceMotion ||
        modelRef.current.activeId !== id ||
        modelRef.current.phase !== 'shown'
      ) {
        debugLog('return-without-hero', `id=${id}`);
        resetTransition();
        navigateBack();
        return;
      }

      debugLog('return-request', `id=${id}`);
      setTransitionLocked(true);
      void measureView(targetNodesRef.current.get(id) ?? null).then(
        (targetRect) => {
          debugLog(
            'return-target-measured',
            `id=${id} rect=${formatDebugRect(targetRect)}`,
          );
          if (!isValidHeroRect(targetRect)) {
            resetTransition();
            navigateBack();
            return;
          }

          x.value = targetRect.x;
          y.value = targetRect.y;
          width.value = targetRect.width;
          height.value = targetRect.height;
          borderRadius.value = 8;
          opacity.value = 1;
          setOverlayVisible(true);
          debugLog('return-overlay-mounted', `id=${id}`);
          applyEvent({ id, type: 'begin-return' });

          frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            debugLog('router-back', `id=${id}`);
            navigateBack();

            frameRef.current = requestAnimationFrame(() => {
              frameRef.current = null;
              void measureView(sourceNodesRef.current.get(id) ?? null).then(
                (sourceRect) => {
                  debugLog(
                    'return-source-measured',
                    `id=${id} rect=${formatDebugRect(sourceRect)}`,
                  );
                  if (
                    modelRef.current.activeId !== id ||
                    modelRef.current.phase !== 'returning'
                  ) {
                    return;
                  }

                  if (
                    returnTransitionMode(sourceRect) === 'move' &&
                    isValidHeroRect(sourceRect)
                  ) {
                    debugLog('return-animation-start', `id=${id}`);
                    animationTimerRef.current = setTimeout(() => {
                      animationTimerRef.current = null;
                      debugLog('return-watchdog-fired', `id=${id}`);
                      finishReturnAnimation(id, 'watchdog');
                    }, HERO_ANIMATION_WATCHDOG_MS);
                    x.value = withTiming(sourceRect.x, HERO_ANIMATION_CONFIG);
                    y.value = withTiming(sourceRect.y, HERO_ANIMATION_CONFIG);
                    width.value = withTiming(
                      sourceRect.width,
                      HERO_ANIMATION_CONFIG,
                    );
                    height.value = withTiming(
                      sourceRect.height,
                      HERO_ANIMATION_CONFIG,
                      (finished) => {
                        scheduleOnRN(reportReturnUiFinished, id, finished);
                      },
                    );
                  } else {
                    debugLog('return-fade-fallback', `id=${id}`);
                    animationTimerRef.current = setTimeout(() => {
                      animationTimerRef.current = null;
                      debugLog('return-watchdog-fired', `id=${id}`);
                      finishReturnAnimation(id, 'watchdog');
                    }, HERO_ANIMATION_WATCHDOG_MS);
                    opacity.value = withTiming(
                      0,
                      HERO_ANIMATION_CONFIG,
                      (finished) => {
                        scheduleOnRN(reportReturnUiFinished, id, finished);
                      },
                    );
                  }
                },
              );
            });
          });
        },
      );
    },
    [
      applyEvent,
      borderRadius,
      debugLog,
      finishReturnAnimation,
      height,
      navigateBack,
      opacity,
      reduceMotion,
      reportReturnUiFinished,
      resetTransition,
      setTransitionLocked,
      width,
      x,
      y,
    ],
  );

  const registerSource = useCallback((id: string, node: View | null) => {
    if (node === null) {
      sourceNodesRef.current.delete(id);
      return;
    }
    sourceNodesRef.current.set(id, node);
  }, []);

  const registerTarget = useCallback((id: string, node: View | null) => {
    if (node === null) {
      targetNodesRef.current.delete(id);
      return;
    }
    targetNodesRef.current.set(id, node);
  }, []);

  const isHeroRouteActive = useCallback(
    (id: string) => model.activeId === id && model.phase !== 'idle',
    [model],
  );
  const isGestureEnabled = useCallback(
    (id: string) => isHeroGestureEnabled(model, id),
    [model],
  );
  const isSourceHidden = useCallback(
    (id: string) => model.activeId === id && model.phase !== 'idle',
    [model],
  );
  const isTargetHidden = useCallback(
    (id: string) =>
      model.activeId === id &&
      (model.phase === 'waiting-target' ||
        model.phase === 'entering' ||
        model.phase === 'returning'),
    [model],
  );
  const releaseHeroRoute = useCallback(
    (id: string) => {
      if (shouldResetHeroOnRouteUnmount(modelRef.current, id)) {
        resetTransition();
      }
    },
    [resetTransition],
  );

  const contextValue = useMemo<HeroTransitionContextValue>(
    () => ({
      isBusy,
      isGestureEnabled,
      isHeroRouteActive,
      isSourceHidden,
      isTargetHidden,
      notifyTargetReady,
      registerSource,
      registerTarget,
      releaseHeroRoute,
      returnHero,
      startHero,
    }),
    [
      isBusy,
      isGestureEnabled,
      isHeroRouteActive,
      isSourceHidden,
      isTargetHidden,
      notifyTargetReady,
      registerSource,
      registerTarget,
      releaseHeroRoute,
      returnHero,
      startHero,
    ],
  );

  const overlayStyle = useAnimatedStyle(() => ({
    borderRadius: borderRadius.value,
    height: height.value,
    left: x.value,
    opacity: opacity.value,
    top: y.value,
    width: width.value,
  }));
  const showOverlay = activeHero !== null && overlayVisible;

  useEffect(() => clearPendingWork, [clearPendingWork]);

  return (
    <HeroTransitionContext value={contextValue}>
      <View collapsable={false} style={styles.root}>
        {children}
        {showOverlay ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.overlay,
              HERO_DEBUG_ENABLED && styles.debugOverlay,
              overlayStyle,
            ]}
          >
            {activeHero.overlay}
          </Animated.View>
        ) : null}
        {HERO_DEBUG_ENABLED ? (
          <View pointerEvents="none" style={styles.debugPanel}>
            <Text style={styles.debugTitle}>
              {`Hero ${model.phase} overlay=${String(overlayVisible)} locked=${String(isBusy)}`}
            </Text>
            {debugEvents.map((event, index) => (
              <Text key={`${index}-${event}`} style={styles.debugEvent}>
                {event}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </HeroTransitionContext>
  );
}

interface HeroSourceProps {
  accessibilityLabel: string;
  children: ReactNode;
  heroId: string;
  href: Href;
  overlay: ReactNode;
}

export function HeroSource({
  accessibilityLabel,
  children,
  heroId,
  href,
  overlay,
}: HeroSourceProps): React.JSX.Element {
  const context = useHeroTransition();
  const sourceRef = useCallback(
    (node: View | null) => context.registerSource(heroId, node),
    [context, heroId],
  );
  const hidden = context.isSourceHidden(heroId);

  return (
    <View
      collapsable={false}
      ref={sourceRef}
      style={[
        hidden && styles.hidden,
        HERO_DEBUG_ENABLED && styles.debugSource,
      ]}
    >
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        disabled={context.isBusy}
        onPress={() => context.startHero({ href, id: heroId, overlay })}
        style={({ pressed }) => pressed && styles.pressed}
      >
        {children}
      </Pressable>
    </View>
  );
}

interface HeroTargetProps {
  children: ReactNode;
  heroId: string;
}

export function HeroTarget({
  children,
  heroId,
}: HeroTargetProps): React.JSX.Element {
  const context = useHeroTransition();
  const targetRef = useCallback(
    (node: View | null) => context.registerTarget(heroId, node),
    [context, heroId],
  );
  const hidden = context.isTargetHidden(heroId);

  return (
    <View
      collapsable={false}
      onLayout={() => context.notifyTargetReady(heroId)}
      ref={targetRef}
      style={[
        hidden && styles.hidden,
        HERO_DEBUG_ENABLED && styles.debugTarget,
      ]}
    >
      {children}
    </View>
  );
}

export function useHeroBack(heroId: string): {
  active: boolean;
  gestureEnabled: boolean;
  goBack: () => void;
  release: () => void;
} {
  const context = useHeroTransition();
  const { releaseHeroRoute, returnHero } = context;
  return {
    active: context.isHeroRouteActive(heroId),
    gestureEnabled: context.isGestureEnabled(heroId),
    goBack: useCallback(() => returnHero(heroId), [heroId, returnHero]),
    release: useCallback(
      () => releaseHeroRoute(heroId),
      [heroId, releaseHeroRoute],
    ),
  };
}

function useHeroTransition(): HeroTransitionContextValue {
  const context = use(HeroTransitionContext);
  if (context === null) {
    throw new Error(
      'Hero components must be used inside HeroTransitionProvider.',
    );
  }
  return context;
}

const styles = StyleSheet.create({
  debugEvent: {
    color: '#D7F9F1',
    fontFamily: 'monospace',
    fontSize: 9,
    lineHeight: 12,
  },
  debugOverlay: {
    boxShadow: 'inset 0 0 0 2px #FF2D92',
  },
  debugPanel: {
    backgroundColor: 'rgba(14, 20, 24, 0.92)',
    borderColor: '#37D5A5',
    borderRadius: 4,
    borderWidth: 1,
    maxWidth: 320,
    padding: 8,
    position: 'absolute',
    right: 8,
    top: 8,
    zIndex: 2000,
  },
  debugSource: {
    boxShadow: 'inset 0 0 0 1px #FF453A',
  },
  debugTarget: {
    boxShadow: 'inset 0 0 0 1px #0A84FF',
  },
  debugTitle: {
    color: '#FFFFFF',
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  hidden: {
    opacity: 0,
  },
  overlay: {
    overflow: 'hidden',
    position: 'absolute',
    zIndex: 1000,
  },
  pressed: {
    opacity: 0.82,
  },
  root: {
    flex: 1,
  },
});
