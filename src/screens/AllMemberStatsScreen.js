import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

export function AllMemberStatsScreen({ route }) {
  const insets = useSafeAreaInsets();
  const { stats, tripName } = route.params;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={styles.subtitle}>{tripName}</Text>

      {stats.map((member) => (
        <View key={member.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>
                {(member.name || '?')[0].toUpperCase()}
              </Text>
            </View>
            <Text style={styles.memberName}>
              {member.isCurrentUser ? 'You' : member.name}
            </Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValueWater}>
                {'\uD83D\uDCA7'} {member.waterCount}
              </Text>
              <Text style={styles.statLabel}>Water</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValueShot}>
                {'\uD83E\uDD43'} {member.shotCount}
              </Text>
              <Text style={styles.statLabel}>Shots</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {member.acceptanceRate !== null
                  ? `${member.acceptanceRate}%`
                  : '\u2014'}
              </Text>
              <Text style={styles.statLabel}>Accept</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {member.streak > 0 ? `\uD83D\uDD25 ${member.streak}` : '\u2014'}
              </Text>
              <Text style={styles.statLabel}>Streak</Text>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  subtitle: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.lavender,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarInitial: {
    color: '#fff',
    fontFamily: fonts.headingSemiBold,
    fontSize: 18,
  },
  memberName: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 17,
    color: colors.navy,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValueWater: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 20,
    color: '#1A9E92',
    marginBottom: 2,
  },
  statValueShot: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 20,
    color: '#C47538',
    marginBottom: 2,
  },
  statValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.navy,
    marginBottom: 2,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
