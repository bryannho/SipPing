import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export function StatsScreen({ navigation }) {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);
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

      // Fetch members, all pings, and all logs for this trip
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
        const sentPings = pings.filter((p) => p.from_user_id === member.id);
        const receivedPings = pings.filter((p) => p.to_user_id === member.id);

        const watersSent = sentPings.filter((p) => p.type === 'water').length;
        const shotsSent = sentPings.filter((p) => p.type === 'shot').length;
        const watersReceived = receivedPings.filter((p) => p.type === 'water').length;
        const shotsReceived = receivedPings.filter((p) => p.type === 'shot').length;

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

        // Calculate streak (consecutive days with at least one drink logged)
        const memberLogs = logs.filter((l) => l.user_id === member.id);
        const streak = calculateStreak(memberLogs);

        const totalDrinks = memberLogs.length;

        return {
          id: member.id,
          name: member.name || member.email,
          isCurrentUser: member.id === user.id,
          watersSent,
          shotsSent,
          watersReceived,
          shotsReceived,
          acceptanceRate,
          streak,
          totalDrinks,
        };
      });

      // Sort by total drinks descending
      memberStats.sort((a, b) => b.totalDrinks - a.totalDrinks);

      setStats(memberStats);
    },
    [user.id]
  );

  const calculateStreak = (logs) => {
    if (logs.length === 0) return 0;

    // Get unique days (in local time)
    const days = new Set();
    logs.forEach((log) => {
      const d = new Date(log.logged_at);
      days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });

    const sortedDays = Array.from(days).sort().reverse();
    if (sortedDays.length === 0) return 0;

    // Check if today or yesterday is in the set (streak must be current)
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
      await fetchStats(tripId);
    }
    setLoading(false);
  }, [fetchTrips, fetchStats, selectedTripId]);

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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  if (trips.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="bar-chart-outline" size={64} color="#ccc" />
        <Text style={styles.emptyTitle}>No Trips Yet</Text>
        <Text style={styles.emptySubtitle}>
          Join or create a trip to see stats.
        </Text>
      </View>
    );
  }

  const selectedTrip = trips.find((t) => t.id === selectedTripId) || trips[0];
  const isCompleted = selectedTrip?.status !== 'active';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Trip selector */}
      {trips.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tripSelector}
        >
          {trips.map((trip) => (
            <TouchableOpacity
              key={trip.id}
              style={[
                styles.tripTab,
                trip.id === selectedTripId && styles.tripTabActive,
                trip.status !== 'active' && styles.tripTabCompleted,
              ]}
              onPress={() => {
                setSelectedTripId(trip.id);
                fetchStats(trip.id);
              }}
            >
              <Text
                style={[
                  styles.tripTabText,
                  trip.id === selectedTripId && styles.tripTabTextActive,
                ]}
                numberOfLines={1}
              >
                {trip.name}
                {trip.status !== 'active' ? ' (done)' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {isCompleted && (
        <View style={styles.completedBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#27AE60" />
          <Text style={styles.completedText}>This trip has ended</Text>
        </View>
      )}

      {/* Quick links */}
      <View style={styles.linkRow}>
        <TouchableOpacity
          style={styles.linkCard}
          onPress={() =>
            navigation.navigate('DrinkLog', {
              tripId: selectedTripId,
              tripName: selectedTrip?.name,
            })
          }
        >
          <Ionicons name="list-outline" size={22} color="#4A90D9" />
          <Text style={styles.linkCardText}>Drink Log</Text>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkCard}
          onPress={() =>
            navigation.navigate('ScheduleRules', { tripId: selectedTripId })
          }
        >
          <Ionicons name="timer-outline" size={22} color="#4A90D9" />
          <Text style={styles.linkCardText}>Schedules</Text>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>
      </View>

      {/* Shareable leaderboard */}
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'png', quality: 1 }}
        style={styles.shareableCard}
      >
        <View style={styles.shareCardInner}>
          <Text style={styles.sectionTitle}>Leaderboard</Text>

          {stats.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardText}>
                No activity yet. Start sending pings!
              </Text>
            </View>
          ) : (
            stats.map((member, index) => (
              <View
                key={member.id}
                style={[styles.memberCard, member.isCurrentUser && styles.memberCardSelf]}
              >
                <View style={styles.memberHeader}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                  </View>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberInitial}>
                      {(member.name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {member.name}
                      {member.isCurrentUser ? ' (You)' : ''}
                    </Text>
                    <Text style={styles.memberTotal}>
                      {member.totalDrinks} drink{member.totalDrinks !== 1 ? 's' : ''} total
                    </Text>
                  </View>
                  {member.streak > 0 && (
                    <View style={styles.streakBadge}>
                      <Text style={styles.streakEmoji}>🔥</Text>
                      <Text style={styles.streakCount}>{member.streak}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      💧 {member.watersSent + member.watersReceived}
                    </Text>
                    <Text style={styles.statLabel}>Waters</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      🍾 {member.shotsSent + member.shotsReceived}
                    </Text>
                    <Text style={styles.statLabel}>Shots</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {member.acceptanceRate !== null
                        ? `${member.acceptanceRate}%`
                        : '—'}
                    </Text>
                    <Text style={styles.statLabel}>Accept Rate</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {member.streak > 0 ? `${member.streak}d` : '—'}
                    </Text>
                    <Text style={styles.statLabel}>Streak</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailText}>
                    Sent: {member.watersSent}💧 {member.shotsSent}🍾
                  </Text>
                  <Text style={styles.detailText}>
                    Received: {member.watersReceived}💧 {member.shotsReceived}🍾
                  </Text>
                </View>
              </View>
            ))
          )}

          <Text style={styles.watermark}>SipPing</Text>
        </View>
      </ViewShot>

      {/* Share button */}
      {stats.length > 0 && (
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
          disabled={sharing}
        >
          {sharing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={styles.shareButtonText}>Share Stats</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Account link */}
      <TouchableOpacity
        style={styles.accountLink}
        onPress={() => navigation.navigate('Account')}
      >
        <Ionicons name="person-circle-outline" size={22} color="#888" />
        <Text style={styles.accountLinkText}>Account Settings</Text>
        <Ionicons name="chevron-forward" size={16} color="#ccc" />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
  },
  tripSelector: {
    marginBottom: 16,
  },
  tripTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    marginRight: 8,
  },
  tripTabActive: {
    backgroundColor: '#4A90D9',
  },
  tripTabCompleted: {
    opacity: 0.7,
  },
  tripTabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  tripTabTextActive: {
    color: '#fff',
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F8EF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  completedText: {
    fontSize: 14,
    color: '#27AE60',
    fontWeight: '500',
  },
  linkRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  linkCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  linkCardText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  shareableCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  shareCardInner: {
    backgroundColor: '#F5F7FA',
    borderRadius: 16,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  emptyCardText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  memberCardSelf: {
    borderWidth: 1.5,
    borderColor: '#4A90D9',
    backgroundColor: '#F8FBFF',
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8E8E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  rankText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#4A90D9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  memberInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  memberTotal: {
    fontSize: 13,
    color: '#888',
    marginTop: 1,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5EB',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 2,
  },
  streakEmoji: {
    fontSize: 14,
  },
  streakCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E67E22',
  },
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingTop: 10,
  },
  detailText: {
    fontSize: 12,
    color: '#888',
  },
  watermark: {
    textAlign: 'center',
    fontSize: 12,
    color: '#ccc',
    marginTop: 12,
    fontWeight: '600',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A90D9',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 16,
    gap: 8,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  accountLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  accountLinkText: {
    flex: 1,
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
});
