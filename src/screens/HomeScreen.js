import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { pickAndUploadDrinkPhoto } from '../utils/imageUpload';
import { playAcceptHaptic, playDeclineHaptic } from '../utils/sounds';
import { PingAnimation } from '../components/PingAnimation';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

export function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [members, setMembers] = useState([]);
  const [todayStats, setTodayStats] = useState({ water: 0, shot: 0 });
  const [pendingPings, setPendingPings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [animation, setAnimation] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const successOpacity = useRef(new Animated.Value(0)).current;
  const [tripDropdownOpen, setTripDropdownOpen] = useState(false);

  const fetchTrips = useCallback(async () => {
    const { data } = await supabase
      .from('trip_members')
      .select('trip_id, trips(id, name, status, invite_code, start_date, end_date)')
      .eq('user_id', user.id);

    const allTrips = (data || [])
      .map((tm) => tm.trips)
      .filter(Boolean);

    const today = new Date().toISOString().split('T')[0];
    const tripsToComplete = allTrips.filter(
      (t) => t.status === 'active' && t.end_date && t.end_date < today
    );
    if (tripsToComplete.length > 0) {
      await Promise.all(
        tripsToComplete.map((t) =>
          supabase
            .from('trips')
            .update({ status: 'completed' })
            .eq('id', t.id)
        )
      );
      tripsToComplete.forEach((t) => {
        t.status = 'completed';
      });
    }

    const activeTrips = allTrips.filter((t) => t.status === 'active');
    setTrips(activeTrips);
    return activeTrips;
  }, [user.id]);

  const fetchTripData = useCallback(
    async (tripId) => {
      if (!tripId) return;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);

      const [membersResult, statsResult, pendingResult] = await Promise.all([
        supabase
          .from('trip_members')
          .select('user_id, users(id, name, email)')
          .eq('trip_id', tripId),
        supabase
          .from('drink_log')
          .select('type')
          .eq('trip_id', tripId)
          .eq('user_id', user.id)
          .gte('logged_at', todayStart.toISOString())
          .lt('logged_at', tomorrowStart.toISOString()),
        supabase
          .from('drink_pings')
          .select(
            '*, sender:users!drink_pings_from_user_id_fkey(name, email), trip:trips(name)'
          )
          .eq('trip_id', tripId)
          .eq('to_user_id', user.id)
          .in('status', ['pending', 'snoozed'])
          .order('created_at', { ascending: false }),
      ]);

      if (membersResult.data) {
        setMembers(
          membersResult.data
            .map((m) => m.users)
            .filter((u) => u && u.id !== user.id)
        );
      }

      if (statsResult.data) {
        const stats = { water: 0, shot: 0 };
        statsResult.data.forEach((log) => {
          stats[log.type] = (stats[log.type] || 0) + 1;
        });
        setTodayStats(stats);
      }

      setPendingPings(pendingResult.data || []);
    },
    [user.id]
  );

  const loadAll = useCallback(async () => {
    const activeTrips = await fetchTrips();
    const tripId =
      (selectedTripId && activeTrips.find((t) => t.id === selectedTripId)?.id) ||
      activeTrips[0]?.id;
    if (tripId) {
      setSelectedTripId(tripId);
      await fetchTripData(tripId);
    }
    setLoading(false);
  }, [fetchTrips, fetchTripData, selectedTripId]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  // Realtime subscriptions
  useEffect(() => {
    if (!selectedTripId) return;

    const channel = supabase
      .channel(`home-${selectedTripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drink_pings',
          filter: `trip_id=eq.${selectedTripId}`,
        },
        () => fetchTripData(selectedTripId)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drink_log',
          filter: `trip_id=eq.${selectedTripId}`,
        },
        () => fetchTripData(selectedTripId)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_members',
          filter: `trip_id=eq.${selectedTripId}`,
        },
        () => fetchTripData(selectedTripId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTripId, fetchTripData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const showSuccessBanner = (message) => {
    setSuccessMessage(message);
    successOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1200),
      Animated.timing(successOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setSuccessMessage(null));
  };

  const handleAccept = async (ping) => {
    setActionLoading(ping.id);
    await playAcceptHaptic();
    setAnimation({ type: ping.type });

    const { error: updateError } = await supabase
      .from('drink_pings')
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
      })
      .eq('id', ping.id);

    if (updateError) {
      setActionLoading(null);
      setAnimation(null);
      Alert.alert('Error', updateError.message);
      return;
    }

    const { data: logEntry, error: logError } = await supabase
      .from('drink_log')
      .insert({
        trip_id: ping.trip_id,
        user_id: user.id,
        type: ping.type,
        ping_id: ping.id,
      })
      .select('id')
      .single();

    if (logError) {
      setActionLoading(null);
      setAnimation(null);
      Alert.alert('Error', logError.message);
      return;
    }

    setPendingPings((prev) => prev.filter((p) => p.id !== ping.id));
    setActionLoading(null);

    const emoji = ping.type === 'water' ? '💧' : '🍾';
    showSuccessBanner(`${emoji} Drink accepted!`);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const imageUrl = await pickAndUploadDrinkPhoto(user.id, ping.trip_id, ping.id);
    if (imageUrl && logEntry?.id) {
      await supabase
        .from('drink_log')
        .update({ image_url: imageUrl })
        .eq('id', logEntry.id);
      showSuccessBanner('📸 Photo uploaded!');
    }
  };

  const handleDecline = (ping) => {
    Alert.alert('Decline Ping', 'Are you sure you want to decline?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(ping.id);
          await playDeclineHaptic();

          await supabase
            .from('drink_pings')
            .update({
              status: 'declined',
              responded_at: new Date().toISOString(),
            })
            .eq('id', ping.id);

          setActionLoading(null);
          setPendingPings((prev) => prev.filter((p) => p.id !== ping.id));
        },
      },
    ]);
  };

  const handleSnooze = async (ping) => {
    setActionLoading(ping.id);
    const snoozedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabase
      .from('drink_pings')
      .update({
        status: 'snoozed',
        snoozed_until: snoozedUntil,
        snooze_count: ping.snooze_count + 1,
      })
      .eq('id', ping.id);

    setActionLoading(null);
    setPendingPings((prev) =>
      prev.map((p) =>
        p.id === ping.id
          ? { ...p, status: 'snoozed', snoozed_until: snoozedUntil, snooze_count: p.snooze_count + 1 }
          : p
      )
    );
  };

  const handleQuickSend = (member, type) => {
    navigation.navigate('SendTab', {
      screen: 'Send',
      params: {
        tripId: selectedTripId,
        toUserId: member.id,
        toUserName: member.name || member.email,
        drinkType: type,
      },
    });
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMin = Math.floor((now - date) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return date.toLocaleDateString();
  };

  const formatSnoozeRemaining = (snoozedUntil) => {
    const until = new Date(snoozedUntil);
    const now = new Date();
    const diffMs = until - now;
    if (diffMs <= 0) return 'Unsnoozing soon...';
    const mins = Math.ceil(diffMs / 60000);
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      return `Unsnoozes in ${hrs}h ${mins % 60}m`;
    }
    return `Unsnoozes in ${mins}m`;
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
        <Ionicons name="airplane-outline" size={64} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>No Active Trips</Text>
        <Text style={styles.emptySubtitle}>
          Create or join a trip to start pinging!
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('MeTab', { screen: 'CreateTrip' })}
        >
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Create Trip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('MeTab', { screen: 'JoinTrip' })}
        >
          <Text style={styles.secondaryButtonText}>Join with Code</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const selectedTrip = trips.find((t) => t.id === selectedTripId) || trips[0];

  return (
    <View style={styles.container}>
      <PingAnimation
        type={animation?.type}
        visible={!!animation}
        onComplete={() => setAnimation(null)}
      />
      {successMessage && (
        <Animated.View style={[styles.successBanner, { opacity: successOpacity }]}>
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={styles.successBannerText}>{successMessage}</Text>
        </Animated.View>
      )}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Trip selector dropdown */}
        <TouchableOpacity
          style={styles.tripDropdown}
          onPress={() => trips.length > 1 && setTripDropdownOpen(!tripDropdownOpen)}
          activeOpacity={trips.length > 1 ? 0.7 : 1}
        >
          <Text style={styles.tripDropdownText}>{selectedTrip.name}</Text>
          {trips.length > 1 && (
            <Ionicons
              name={tripDropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
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
                  fetchTripData(trip.id);
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
                </Text>
                {trip.id === selectedTripId && (
                  <Ionicons name="checkmark" size={18} color={colors.cta} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Today's stats — gradient accent cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statCardWater]}>
            <Text style={styles.statEmoji}>💧</Text>
            <Text style={styles.statCount}>{todayStats.water}</Text>
            <Text style={styles.statLabel}>Waters today</Text>
          </View>
          <View style={[styles.statCard, styles.statCardShot]}>
            <Text style={styles.statEmoji}>🍾</Text>
            <Text style={styles.statCount}>{todayStats.shot}</Text>
            <Text style={styles.statLabel}>Shots today</Text>
          </View>
        </View>

        {/* Pending pings — inline cards */}
        {pendingPings.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Pending ({pendingPings.length})
            </Text>
            {pendingPings.map((ping) => {
              const isActioning = actionLoading === ping.id;
              const isSnoozed = ping.status === 'snoozed';
              const emoji = ping.type === 'water' ? '💧' : '🍾';
              const senderName = ping.sender?.name || ping.sender?.email || 'Someone';
              const accentColor = ping.type === 'water' ? colors.teal : colors.amber;

              return (
                <View key={ping.id} style={styles.pingCard}>
                  <View style={[styles.pingAccent, { backgroundColor: accentColor }]} />
                  <View style={styles.pingBody}>
                    <View style={styles.pingHeader}>
                      <Text style={styles.pingEmoji}>{emoji}</Text>
                      <View style={styles.pingInfo}>
                        <Text style={styles.pingSender}>{senderName}</Text>
                        <Text style={styles.pingMeta}>
                          {formatTime(ping.created_at)}
                        </Text>
                      </View>
                      {isSnoozed && (
                        <View style={styles.snoozedBadge}>
                          <Ionicons name="time" size={12} color={colors.amber} />
                          <Text style={styles.snoozedBadgeText}>Snoozed</Text>
                        </View>
                      )}
                    </View>

                    {isSnoozed && ping.snoozed_until && (
                      <View style={styles.snoozeInfo}>
                        <Ionicons name="alarm-outline" size={14} color={colors.amber} />
                        <Text style={styles.snoozeInfoText}>
                          {formatSnoozeRemaining(ping.snoozed_until)}
                        </Text>
                      </View>
                    )}

                    {ping.sender_note && (
                      <View style={styles.noteContainer}>
                        <Text style={styles.noteText}>"{ping.sender_note}"</Text>
                      </View>
                    )}

                    {isActioning ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.cta}
                        style={styles.actionLoader}
                      />
                    ) : (
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={styles.acceptButton}
                          onPress={() => handleAccept(ping)}
                        >
                          <Ionicons name="checkmark" size={18} color="#fff" />
                          <Text style={styles.acceptText}>Accept</Text>
                        </TouchableOpacity>
                        {!isSnoozed && (
                          <TouchableOpacity
                            style={styles.snoozeButton}
                            onPress={() => handleSnooze(ping)}
                          >
                            <Ionicons name="time-outline" size={18} color={colors.amber} />
                            <Text style={styles.snoozeText}>Later</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.declineButton}
                          onPress={() => handleDecline(ping)}
                        >
                          <Ionicons name="close" size={18} color={colors.error} />
                          <Text style={styles.declineText}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {pendingPings.length === 0 && (
          <View style={styles.allCaughtUp}>
            <Ionicons name="checkmark-circle-outline" size={24} color={colors.success} />
            <Text style={styles.allCaughtUpText}>All caught up!</Text>
          </View>
        )}

        {/* Quick Send */}
        <Text style={styles.sectionTitle}>Quick Send</Text>
        {members.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>
              No other members yet. Share your invite code to add friends!
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.memberScroll}
            contentContainerStyle={styles.memberScrollContent}
          >
            {members.map((member) => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberInitial}>
                    {(member.name || member.email || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.name || member.email}
                </Text>
                <View style={styles.quickSendRow}>
                  <TouchableOpacity
                    style={[styles.quickSendBtn, styles.quickSendWater]}
                    onPress={() => handleQuickSend(member, 'water')}
                  >
                    <Text style={styles.quickSendEmoji}>💧</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.quickSendBtn, styles.quickSendShot]}
                    onPress={() => handleQuickSend(member, 'shot')}
                  >
                    <Text style={styles.quickSendEmoji}>🍾</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </ScrollView>
    </View>
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
    marginBottom: 28,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cta,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  primaryButtonText: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: colors.cta,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginBottom: spacing.lg,
  },
  secondaryButtonText: {
    color: colors.cta,
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
  // Trip dropdown
  tripDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  tripDropdownText: {
    ...typography.h2,
    flex: 1,
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
  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.card,
  },
  statCardWater: {
    borderBottomWidth: 3,
    borderBottomColor: colors.teal,
  },
  statCardShot: {
    borderBottomWidth: 3,
    borderBottomColor: colors.amber,
  },
  statEmoji: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  statCount: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: colors.navy,
  },
  statLabel: {
    ...typography.caption,
    marginTop: 2,
  },
  // Pending pings
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  pingCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radii.card,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.card,
  },
  pingAccent: {
    width: 4,
  },
  pingBody: {
    flex: 1,
    padding: spacing.md,
  },
  pingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  pingEmoji: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  pingInfo: {
    flex: 1,
  },
  pingSender: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 17,
    color: colors.navy,
  },
  pingMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  snoozedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 148, 90, 0.12)',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  snoozedBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.amber,
  },
  snoozeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 148, 90, 0.08)',
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: 10,
    gap: 6,
  },
  snoozeInfoText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.amber,
  },
  noteContainer: {
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    padding: 10,
    marginBottom: spacing.md,
  },
  noteText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    borderRadius: radii.md,
    paddingVertical: 12,
    gap: spacing.xs,
  },
  acceptText: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  snoozeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232, 148, 90, 0.1)',
    borderRadius: radii.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.amber,
    gap: spacing.xs,
  },
  snoozeText: {
    color: colors.amber,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(224, 85, 85, 0.08)',
    borderRadius: radii.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.error,
    gap: spacing.xs,
  },
  declineText: {
    color: colors.error,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  actionLoader: {
    paddingVertical: 14,
  },
  // All caught up
  allCaughtUp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 125, 0.08)',
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  allCaughtUpText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.success,
  },
  // Quick Send
  memberScroll: {
    marginHorizontal: -spacing.lg,
    marginBottom: spacing.lg,
  },
  memberScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  memberCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.md,
    alignItems: 'center',
    width: 120,
    ...shadows.card,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.lavender,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  memberInitial: {
    color: '#fff',
    fontFamily: fonts.headingSemiBold,
    fontSize: 20,
  },
  memberName: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.navy,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  quickSendRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickSendWater: {
    backgroundColor: 'rgba(46, 196, 182, 0.12)',
  },
  quickSendShot: {
    backgroundColor: 'rgba(232, 148, 90, 0.12)',
  },
  quickSendEmoji: {
    fontSize: 18,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  emptyCardText: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Success banner
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: spacing.sm,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  successBannerText: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
});
