import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';
import { colors } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PARTICLE_COUNT = 24;

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Confetti animation for shot pings — colorful particles bursting outward.
 */
export function ShotConfetti({ onComplete }) {
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      anim: new Animated.Value(0),
      x: randomBetween(-SCREEN_WIDTH * 0.4, SCREEN_WIDTH * 0.4),
      y: randomBetween(-SCREEN_HEIGHT * 0.5, -SCREEN_HEIGHT * 0.1),
      rotation: randomBetween(0, 720),
      color: [colors.cta, '#FFD93D', colors.success, colors.teal, colors.amber, colors.lavender][
        Math.floor(Math.random() * 6)
      ],
      size: randomBetween(6, 14),
    }))
  ).current;

  useEffect(() => {
    const animations = particles.map((p) =>
      Animated.timing(p.anim, {
        toValue: 1,
        duration: randomBetween(800, 1400),
        useNativeDriver: true,
      })
    );

    Animated.stagger(30, animations).start(() => {
      onComplete?.();
    });
  }, []);

  return (
    <View style={styles.overlay} pointerEvents="none">
      {particles.map((p, i) => {
        const translateX = p.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, p.x],
        });
        const translateY = p.anim.interpolate({
          inputRange: [0, 0.4, 1],
          outputRange: [0, p.y, p.y + SCREEN_HEIGHT * 0.6],
        });
        const opacity = p.anim.interpolate({
          inputRange: [0, 0.2, 0.8, 1],
          outputRange: [0, 1, 1, 0],
        });
        const rotate = p.anim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${p.rotation}deg`],
        });
        const scale = p.anim.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0, 1.2, 0.6],
        });

        return (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                width: p.size,
                height: p.size * 0.6,
                backgroundColor: p.color,
                borderRadius: 2,
                transform: [{ translateX }, { translateY }, { rotate }, { scale }],
                opacity,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/**
 * Water splash animation — blue droplets radiating outward.
 */
export function WaterSplash({ onComplete }) {
  const droplets = useRef(
    Array.from({ length: 16 }, (_, i) => ({
      anim: new Animated.Value(0),
      angle: (i / 16) * Math.PI * 2,
      distance: randomBetween(60, 140),
      size: randomBetween(8, 18),
      delay: randomBetween(0, 200),
    }))
  ).current;

  const ripple = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const dropletAnims = droplets.map((d) =>
      Animated.sequence([
        Animated.delay(d.delay),
        Animated.timing(d.anim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );

    Animated.parallel([
      Animated.timing(ripple, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      ...dropletAnims,
    ]).start(() => {
      onComplete?.();
    });
  }, []);

  const rippleScale = ripple.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 3],
  });
  const rippleOpacity = ripple.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0.4, 0.2, 0],
  });

  return (
    <View style={styles.overlay} pointerEvents="none">
      {/* Central ripple */}
      <Animated.View
        style={[
          styles.ripple,
          {
            transform: [{ scale: rippleScale }],
            opacity: rippleOpacity,
          },
        ]}
      />

      {/* Droplets */}
      {droplets.map((d, i) => {
        const translateX = d.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.cos(d.angle) * d.distance],
        });
        const translateY = d.anim.interpolate({
          inputRange: [0, 0.6, 1],
          outputRange: [0, Math.sin(d.angle) * d.distance, Math.sin(d.angle) * d.distance + 40],
        });
        const opacity = d.anim.interpolate({
          inputRange: [0, 0.2, 0.7, 1],
          outputRange: [0, 1, 0.8, 0],
        });
        const scale = d.anim.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0, 1, 0.3],
        });

        return (
          <Animated.View
            key={i}
            style={[
              styles.droplet,
              {
                width: d.size,
                height: d.size,
                borderRadius: d.size / 2,
                transform: [{ translateX }, { translateY }, { scale }],
                opacity,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/**
 * Wrapper that shows the right animation based on drink type.
 */
export function PingAnimation({ type, visible, onComplete }) {
  if (!visible) return null;

  if (type === 'shot') {
    return <ShotConfetti onComplete={onComplete} />;
  }
  return <WaterSplash onComplete={onComplete} />;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  particle: {
    position: 'absolute',
  },
  ripple: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.teal,
  },
  droplet: {
    position: 'absolute',
    backgroundColor: colors.teal,
  },
});
