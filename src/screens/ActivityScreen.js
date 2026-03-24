import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function ActivityScreen({ navigation }) {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [stats, setStats] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [tripDropdownOpen, setTripDropdownOpen] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const viewShotRef = useRef();

  const fetchTrips = useCallback(async () => {
    const { data } = await supabase
      .from('trip_members')
      .select('trip_id, trips(id, name, status, start_date, end_date)')
      .eq('user_id', user.id);

    const allTrips = (data || [])
      .map((tm) => tm.trips)
      .filter(Boolean)
      .sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return 0;
      });

    setTrips(allTrips);
    return allTrips;
  }, [user.id]);

  const fetchStats = useCallback(
    async (tripId) => {
      if (!tripId) return;

      const [membersResult, pingsResult, logsResult] = await Promise.all([
        supabase
          .from('trip_members')
          .select('user_id, users(id, name, email)')
          .eq('trip_id', tripId),
        supabase
          .from('drink_pings')
          .select('id, from_user_id, to_user_id, type, status')
          .eq('trip_id', tripId),
        supabase
          .from('drink_log')
          .select('id, user_id, type, logged_at')
          .eq('trip_id', tripId)
          .order('logged_at', { ascending: true }),
      ]);

      const members = (membersResult.data || [])
        .map((m) => m.users)
        .filter(Boolean);
      const pings = pingsResult.data || [];
      const logs = logsResult.data || [];

      const memberStats = members.map((member) => {
        const receivedPings = pings.filter((p) => p.to_user_id === member.id);
        const memberLogs = logs.filter((l) => l.user_id === member.id);

        const waterCount = memberLogs.filter((l) => l.type === 'water').length;
        const shotCount = memberLogs.filter((l) => l.type === 'shot').length;

        const acceptedReceived = receivedPings.filter(
          (p) => p.status === 'accepted'
        ).length;
        const respondedReceived = receivedPings.filter((p) =>
          ['accepted', 'declined'].includes(p.status)
        ).length;
        const acceptanceRate =
          respondedReceived > 0
            ? Math.round((acceptedReceived / respondedReceived) * 100)
            : null;

        const streak = calculateStreak(memberLogs);

        return {
          id: member.id,
          name: member.name || member.email,
          isCurrentUser: member.id === user.id,
          waterCount,
          shotCount,
          acceptanceRate,
          streak,
          totalDrinks: memberLogs.length,
        };
      });

      setStats(memberStats);
    },
    [user.id]
  );

  const fetchRecentLogs = useCallback(
    async (tripId) => {
      if (!tripId) return;

      const { data } = await supabase
        .from('drink_log')
        .select('*, user:users!drink_log_user_id_fkey(name, email)')
        .eq('trip_id', tripId)
        .order('logged_at', { ascending: false })
        .limit(15);

      const rows = data || [];
      setRecentLogs(rows);

      const photoPaths = rows
        .filter((l) => l.image_url)
        .map((l) => l.image_url);

      if (photoPaths.length > 0) {
        const { data: signed } = await supabase.storage
          .from('drink-photos')
          .createSignedUrls(photoPaths, 3600);

        if (signed) {
          const urlMap = {};
          signed.forEach((s) => {
            if (s.signedUrl) urlMap[s.path] = s.signedUrl;
          });
          setSignedUrls(urlMap);
        }
      }
    },
    []
  );

  const calculateStreak = (logs) => {
    if (logs.length === 0) return 0;

    const days = new Set();
    logs.forEach((log) => {
      const d = new Date(log.logged_at);
      days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });

    const sortedDays = Array.from(days).sort().reverse();
    if (sortedDays.length === 0) return 0;

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;

    if (sortedDays[0] !== todayKey && sortedDays[0] !== yesterdayKey) return 0;

    let streak = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      const prev = parseDayKey(sortedDays[i - 1]);
      const curr = parseDayKey(sortedDays[i]);
      const diffMs = prev - curr;
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

  const parseDayKey = (key) => {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month, day);
  };

  const loadAll = useCallback(async () => {
    const allTrips = await fetchTrips();
    const tripId =
      (selectedTripId && allTrips.find((t) => t.id === selectedTripId)?.id) ||
      allTrips[0]?.id;
    if (tripId) {
      setSelectedTripId(tripId);
      await Promise.all([fetchStats(tripId), fetchRecentLogs(tripId)]);
    }
    setLoading(false);
  }, [fetchTrips, fetchStats, fetchRecentLogs, selectedTripId]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const handleShare = async () => {
    if (!viewShotRef.current) return;
    setSharing(true);
    try {
      const uri = await viewShotRef.current.capture();
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share Trip Stats',
        });
      } else {
        Alert.alert('Sharing not available', 'Sharing is not supported on this device.');
      }
    } catch (e) {
      console.warn('Share error:', e);
    }
    setSharing(false);
  };

  const formatLogTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

    if (isToday) return `Today, ${timeStr}`;
    if (isYesterday) return `Yesterday, ${timeStr}`;
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.cta} />
      </View>
    );
  }

  if (trips.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="pulse-outline" size={64} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>No Trips Yet</Text>
        <Text style={styles.emptySubtitle}>
          Join or create a trip to see activity.
        </Text>
      </View>
    );
  }

  const selectedTrip = trips.find((t) => t.id === selectedTripId) || trips[0];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Screen title */}
      <Text style={styles.screenTitle}>Activity</Text>
      <TouchableOpacity
        style={styles.subtitleRow}
        onPress={() => trips.length > 1 && setTripDropdownOpen(!tripDropdownOpen)}
        activeOpacity={trips.length > 1 ? 0.7 : 1}
      >
        <Text style={styles.screenSubtitle}>{selectedTrip.name}</Text>
        {selectedTrip.status !== 'active' && (
          <View style={styles.doneBadge}>
            <Text style={styles.doneBadgeText}>Done</Text>
          </View>
        )}
        {trips.length > 1 && (
          <Ionicons
            name={tripDropdownOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textSecondary}
          />
        )}
      </TouchableOpacity>

      {tripDropdownOpen && trips.length > 1 && (
        <View style={styles.tripDropdownMenu}>
          {trips.map((trip) => (
            <TouchableOpacity
              key={trip.id}
              style={[
                styles.tripDropdownItem,
                trip.id === selectedTripId && styles.tripDropdownItemActive,
              ]}
              onPress={() => {
                setSelectedTripId(trip.id);
                Promise.all([fetchStats(trip.id), fetchRecentLogs(trip.id)]);
                setTripDropdownOpen(false);
              }}
            >
              <Text
                style={[
                  styles.tripDropdownItemText,
                  trip.id === selectedTripId && styles.tripDropdownItemTextActive,
                ]}
                numberOfLines={1}
              >
                {trip.name}
                {trip.status !== 'active' ? ' (done)' : ''}
              </Text>
              {trip.id === selectedTripId && (
                <Ionicons name="checkmark" size={18} color={colors.cta} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Trip Summary — shareable */}
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'png', quality: 1 }}
        style={styles.shareableCard}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Trip Summary</Text>
            {stats.length > 0 && (
              <TouchableOpacity
                style={styles.shareIconButton}
                onPress={handleShare}
                disabled={sharing}
              >
                {sharing ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Ionicons name="share-outline" size={16} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            )}
          </View>

          {stats.length === 0 ? (
            <View style={styles.emptySummary}>
              <Text style={styles.emptySummaryText}>
                No activity yet. Start sending pings!
              </Text>
            </View>
          ) : (
            <View style={styles.memberStatsRow}>
              {stats.map((member, index) => (
                <React.Fragment key={member.id}>
                  {index > 0 && <View style={styles.memberDivider} />}
                  <View
                    style={[
                      styles.memberStatCard,
                      member.isCurrentUser && styles.memberStatCardSelf,
                    ]}
                  >
                    <View style={styles.memberStatAvatar}>
                      <Text style={styles.memberStatInitial}>
                        {(member.name || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.memberStatName} numberOfLines={1}>
                      {member.isCurrentUser ? 'You' : member.name}
                    </Text>

                    <View style={styles.memberStatGrid}>
                      <View style={styles.miniStatRow}>
                        <Text style={styles.miniStatWaterValue}>
                          {'\uD83D\uDCA7'} {member.waterCount}
                        </Text>
                      </View>
                      <View style={styles.miniStatRow}>
                        <Text style={styles.miniStatShotValue}>
                          {'\uD83E\uDD43'} {member.shotCount}
                        </Text>
                      </View>

                      <View style={styles.memberStatDivider} />

                      <View style={styles.miniStat}>
                        <Text style={styles.miniStatValue}>
                          {member.acceptanceRate !== null
                            ? `${member.acceptanceRate}%`
                            : '\u2014'}
                        </Text>
                        <Text style={styles.miniStatLabel}>Accept</Text>
                      </View>
                      <View style={styles.miniStat}>
                        <Text style={styles.miniStatValue}>
                          {member.streak > 0 ? `\uD83D\uDD25 ${member.streak}` : '\u2014'}
                        </Text>
                        <Text style={styles.miniStatLabel}>Streak</Text>
                      </View>
                    </View>
                  </View>
                </React.Fragment>
              ))}
            </View>
          )}
        </View>
      </ViewShot>

      {/* Inline Drink Log */}
      <View style={styles.logSection}>
        <View style={styles.logSectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('DrinkLog', {
                tripId: selectedTripId,
                tripName: selectedTrip?.name,
              })
            }
          >
            <Text style={styles.seeAllLink}>See all →</Text>
          </TouchableOpacity>
        </View>

        {recentLogs.length === 0 ? (
          <View style={styles.emptyLogCard}>
            <Text style={styles.emptyLogText}>No drinks logged yet.</Text>
          </View>
        ) : (
          recentLogs.map((log) => {
            const emoji = log.type === 'water' ? '\uD83D\uDCA7' : '\uD83E\uDD43';
            const userName = log.user?.name || log.user?.email || 'Unknown';
            const isCurrentUser = log.user_id === user.id;
            const hasPhoto = log.image_url && signedUrls[log.image_url];

            return (
              <View key={log.id}>
                <View style={styles.logRow}>
                  <Text style={styles.logEmoji}>{emoji}</Text>
                  <View style={styles.logInfo}>
                    <Text style={styles.logUser}>
                      {isCurrentUser ? 'You' : userName}
                    </Text>
                    <Text style={styles.logTime}>
                      {formatLogTime(log.logged_at)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.typeBadge,
                      log.type === 'shot' ? styles.typeBadgeShot : styles.typeBadgeWater,
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeBadgeText,
                        log.type === 'shot'
                          ? styles.typeBadgeTextShot
                          : styles.typeBadgeTextWater,
                      ]}
                    >
                      {log.type}
                    </Text>
                  </View>
                </View>
                {hasPhoto && (
                  <TouchableOpacity
                    style={styles.photoContainer}
                    onPress={() => {
                      setImageLoading(true);
                      setImageError(false);
                      setViewingImage(signedUrls[log.image_url]);
                    }}
                    activeOpacity={0.9}
                  >
                    <Image
                      source={{ uri: signedUrls[log.image_url] }}
                      style={styles.photoThumbnail}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Full-screen image viewer */}
      <Modal
        visible={!!viewingImage}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingImage(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setViewingImage(null)}
          >
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
          {viewingImage && (
            imageError ? (
              <View style={styles.imageErrorContainer}>
                <Ionicons name="image-outline" size={48} color={colors.textSecondary} />
                <Text style={styles.imageErrorText}>Failed to load image</Text>
              </View>
            ) : (
              <>
                {imageLoading && (
                  <ActivityIndicator
                    size="large"
                    color="#fff"
                    style={styles.imageLoader}
                  />
                )}
                <Image
                  source={{ uri: viewingImage }}
                  style={styles.fullImage}
                  resizeMode="contain"
                  onLoadEnd={() => setImageLoading(false)}
                  onError={() => {
                    setImageLoading(false);
                    setImageError(true);
                  }}
                />
              </>
            )
          )}
        </View>
      </Modal>
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
    paddingTop: 60,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    ...typography.h2,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.caption,
    textAlign: 'center',
  },
  // Screen header
  screenTitle: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.navy,
    marginBottom: spacing.xs,
  },
  screenSubtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textSecondary,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  doneBadge: {
    backgroundColor: 'rgba(76, 175, 125, 0.12)',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  doneBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.success,
  },
  tripDropdownMenu: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.card,
  },
  tripDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tripDropdownItemActive: {
    backgroundColor: 'rgba(255, 107, 107, 0.06)',
  },
  tripDropdownItemText: {
    ...typography.bodyMedium,
    flex: 1,
  },
  tripDropdownItemTextActive: {
    color: colors.cta,
    fontFamily: fonts.bodySemiBold,
  },
  // Trip summary
  shareableCard: {
    borderRadius: radii.card,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  summaryTitle: {
    ...typography.h3,
  },
  shareIconButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FAF6F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptySummary: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptySummaryText: {
    ...typography.caption,
    textAlign: 'center',
  },
  memberStatsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  memberDivider: {
    width: 1,
    backgroundColor: colors.border,
    alignSelf: 'stretch',
    marginHorizontal: spacing.sm,
  },
  memberStatCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  memberStatCardSelf: {
    // subtle highlight for current user — no border needed in row layout
  },
  memberStatAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.lavender,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  memberStatInitial: {
    color: '#fff',
    fontFamily: fonts.headingSemiBold,
    fontSize: 18,
  },
  memberStatName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.navy,
  },
  memberStatGrid: {
    width: '100%',
    marginTop: spacing.sm,
  },
  miniStatRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  miniStatWaterValue: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 20,
    color: '#1A9E92',
  },
  miniStatShotValue: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 20,
    color: '#C47538',
  },
  memberStatDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  miniStat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: spacing.xs,
  },
  miniStatValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.navy,
  },
  miniStatLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  // Drink log section
  logSection: {
    marginTop: spacing.sm,
  },
  logSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
  },
  seeAllLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.cta,
  },
  emptyLogCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.card,
  },
  emptyLogText: {
    ...typography.caption,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  logEmoji: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  logInfo: {
    flex: 1,
  },
  logUser: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.navy,
  },
  logTime: {
    ...typography.caption,
    marginTop: 1,
  },
  typeBadge: {
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeWater: {
    backgroundColor: 'rgba(46, 196, 182, 0.12)',
  },
  typeBadgeShot: {
    backgroundColor: 'rgba(232, 148, 90, 0.12)',
  },
  typeBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  typeBadgeTextWater: {
    color: colors.teal,
  },
  typeBadgeTextShot: {
    color: colors.amber,
  },
  photoContainer: {
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  photoThumbnail: {
    width: '100%',
    height: 200,
    borderRadius: radii.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
  },
  fullImage: {
    width: SCREEN_WIDTH - 32,
    height: '80%',
    borderRadius: radii.sm,
  },
  imageLoader: {
    position: 'absolute',
  },
  imageErrorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageErrorText: {
    fontFamily: fonts.body,
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: 10,
  },
});
