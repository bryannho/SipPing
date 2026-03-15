import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export function HomeScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [members, setMembers] = useState([]);
  const [todayStats, setTodayStats] = useState({ water: 0, shot: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrips = useCallback(async () => {
    const { data } = await supabase
      .from('trip_members')
      .select('trip_id, trips(id, name, status, invite_code, start_date)')
      .eq('user_id', user.id);

    const activeTrips = (data || [])
      .map((tm) => tm.trips)
      .filter((t) => t && t.status === 'active');

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
          .select('id', { count: 'exact', head: true })
          .eq('trip_id', tripId)
          .eq('to_user_id', user.id)
          .eq('status', 'pending'),
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

      setPendingCount(pendingResult.count || 0);
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

  // Realtime subscription for live updates
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  // Empty state — no trips
  if (trips.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="airplane-outline" size={64} color="#ccc" />
        <Text style={styles.emptyTitle}>No Active Trips</Text>
        <Text style={styles.emptySubtitle}>
          Create or join a trip to start pinging!
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('CreateTrip')}
        >
          <Ionicons name="add-circle-outline" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Create Trip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('JoinTrip')}
        >
          <Text style={styles.secondaryButtonText}>Join with Code</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signOutLink} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
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
      {/* Trip header / selector */}
      <View style={styles.tripHeader}>
        {trips.length > 1 ? (
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
                ]}
                onPress={() => {
                  setSelectedTripId(trip.id);
                  fetchTripData(trip.id);
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
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.tripName}>{selectedTrip.name}</Text>
        )}
        <TouchableOpacity
          onPress={() =>
            navigation.navigate('TripDetail', {
              tripId: selectedTrip.id,
              tripName: selectedTrip.name,
              inviteCode: selectedTrip.invite_code,
            })
          }
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="settings-outline" size={22} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Today's stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statEmoji}>💧</Text>
          <Text style={styles.statCount}>{todayStats.water}</Text>
          <Text style={styles.statLabel}>Waters today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statEmoji}>🍾</Text>
          <Text style={styles.statCount}>{todayStats.shot}</Text>
          <Text style={styles.statLabel}>Shots today</Text>
        </View>
      </View>

      {/* Pending pings banner */}
      {pendingCount > 0 && (
        <TouchableOpacity
          style={styles.pendingBanner}
          onPress={() => navigation.navigate('PendingTab')}
        >
          <Ionicons name="notifications" size={18} color="#E67E22" />
          <Text style={styles.pendingText}>
            {pendingCount} pending ping{pendingCount !== 1 ? 's' : ''} — tap to
            respond
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#E67E22" />
        </TouchableOpacity>
      )}

      {/* Quick send to members */}
      <Text style={styles.sectionTitle}>Quick Send</Text>
      {members.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>
            No other members yet. Share your invite code to add friends!
          </Text>
          <TouchableOpacity
            style={styles.shareCodeButton}
            onPress={() =>
              navigation.navigate('TripDetail', {
                tripId: selectedTrip.id,
                tripName: selectedTrip.name,
                inviteCode: selectedTrip.invite_code,
              })
            }
          >
            <Text style={styles.shareCodeButtonText}>Share Invite</Text>
          </TouchableOpacity>
        </View>
      ) : (
        members.map((member) => (
          <View key={member.id} style={styles.memberCard}>
            <View style={styles.memberAvatar}>
              <Text style={styles.memberInitial}>
                {(member.name || member.email || '?')[0].toUpperCase()}
              </Text>
            </View>
            <Text style={styles.memberName} numberOfLines={1}>
              {member.name || member.email}
            </Text>
            <TouchableOpacity
              style={styles.quickSendBtn}
              onPress={() => handleQuickSend(member, 'water')}
            >
              <Text style={styles.quickSendEmoji}>💧</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickSendBtn}
              onPress={() => handleQuickSend(member, 'shot')}
            >
              <Text style={styles.quickSendEmoji}>🍾</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Footer actions */}
      <View style={styles.footerButtons}>
        <TouchableOpacity
          style={styles.footerButton}
          onPress={() => navigation.navigate('CreateTrip')}
        >
          <Ionicons name="add-circle-outline" size={18} color="#4A90D9" />
          <Text style={styles.footerButtonText}>New Trip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.footerButton}
          onPress={() => navigation.navigate('JoinTrip')}
        >
          <Ionicons name="enter-outline" size={18} color="#4A90D9" />
          <Text style={styles.footerButtonText}>Join Trip</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOutLink} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
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
    paddingTop: 60,
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
    marginBottom: 28,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A90D9',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginBottom: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#4A90D9',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginBottom: 20,
  },
  secondaryButtonText: {
    color: '#4A90D9',
    fontSize: 16,
    fontWeight: '600',
  },
  signOutLink: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: {
    color: '#E74C3C',
    fontSize: 15,
    fontWeight: '500',
  },
  tripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  tripName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  tripSelector: {
    flex: 1,
    marginRight: 12,
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
  tripTabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  tripTabTextActive: {
    color: '#fff',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  statEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  statCount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  statLabel: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5EB',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    gap: 8,
  },
  pendingText: {
    flex: 1,
    fontSize: 14,
    color: '#E67E22',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: '#F5F7FA',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyCardText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  shareCodeButton: {
    backgroundColor: '#4A90D9',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  shareCodeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4A90D9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberInitial: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  memberName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  quickSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  quickSendEmoji: {
    fontSize: 20,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  footerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4FA',
    borderRadius: 10,
    paddingVertical: 14,
    gap: 6,
  },
  footerButtonText: {
    color: '#4A90D9',
    fontSize: 15,
    fontWeight: '600',
  },
});
