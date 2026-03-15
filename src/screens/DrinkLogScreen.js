import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export function DrinkLogScreen({ route }) {
  const { user } = useAuth();
  const initialTripId = route.params?.tripId;
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(initialTripId || null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrips = useCallback(async () => {
    const { data } = await supabase
      .from('trip_members')
      .select('trip_id, trips(id, name, status)')
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

  const fetchLogs = useCallback(async (tripId) => {
    if (!tripId) return;

    const { data } = await supabase
      .from('drink_log')
      .select('*, user:users!drink_log_user_id_fkey(name, email)')
      .eq('trip_id', tripId)
      .order('logged_at', { ascending: false });

    setLogs(data || []);
  }, []);

  const loadAll = useCallback(async () => {
    const allTrips = await fetchTrips();
    const tripId =
      (selectedTripId && allTrips.find((t) => t.id === selectedTripId)?.id) ||
      allTrips[0]?.id;
    if (tripId) {
      setSelectedTripId(tripId);
      await fetchLogs(tripId);
    }
    setLoading(false);
  }, [fetchTrips, fetchLogs, selectedTripId]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    if (selectedTripId) await fetchLogs(selectedTripId);
    setRefreshing(false);
  };

  const formatDateTime = (dateStr) => {
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

  // Group logs by date
  const groupedLogs = [];
  let currentDate = null;
  logs.forEach((log) => {
    const date = new Date(log.logged_at).toDateString();
    if (date !== currentDate) {
      currentDate = date;
      groupedLogs.push({ rowKind: 'header', date, id: `header-${date}` });
    }
    groupedLogs.push({ rowKind: 'log', ...log });
  });

  const renderItem = ({ item }) => {
    if (item.rowKind === 'header') {
      const d = new Date(item.date);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = d.toDateString() === yesterday.toDateString();

      let label;
      if (isToday) label = 'Today';
      else if (isYesterday) label = 'Yesterday';
      else
        label = d.toLocaleDateString([], {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });

      return (
        <View style={styles.dateHeader}>
          <Text style={styles.dateHeaderText}>{label}</Text>
        </View>
      );
    }

    const emoji = item.type === 'shot' ? '🍾' : '💧';
    const userName = item.user?.name || item.user?.email || 'Unknown';
    const isCurrentUser = item.user_id === user.id;
    const timeStr = new Date(item.logged_at).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

    return (
      <View style={styles.logRow}>
        <Text style={styles.logEmoji}>{emoji}</Text>
        <View style={styles.logInfo}>
          <Text style={styles.logUser}>
            {isCurrentUser ? 'You' : userName}
          </Text>
          <Text style={styles.logTime}>{timeStr}</Text>
        </View>
        <View
          style={[
            styles.typeBadge,
            item.type === 'shot' ? styles.typeBadgeShot : styles.typeBadgeWater,
          ]}
        >
          <Text
            style={[
              styles.typeBadgeText,
              item.type === 'shot'
                ? styles.typeBadgeTextShot
                : styles.typeBadgeTextWater,
            ]}
          >
            {item.type}
          </Text>
        </View>
        {item.image_url && (
          <Ionicons
            name="camera-outline"
            size={16}
            color="#888"
            style={styles.photoIcon}
          />
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Trip selector */}
      {trips.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tripSelector}
          contentContainerStyle={styles.tripSelectorContent}
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
                fetchLogs(trip.id);
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
      )}

      {/* Summary bar */}
      {logs.length > 0 && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>
            💧 {logs.filter((l) => l.type === 'water').length} waters
            {'  '}·{'  '}
            🍾 {logs.filter((l) => l.type === 'shot').length} shots
            {'  '}·{'  '}
            {logs.length} total
          </Text>
        </View>
      )}

      <FlatList
        data={groupedLogs}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          groupedLogs.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>No Drinks Logged</Text>
            <Text style={styles.emptySubtitle}>
              Accept some pings to see your drink history here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  tripSelector: {
    maxHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  tripSelectorContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  tripTabTextActive: {
    color: '#fff',
  },
  summaryBar: {
    backgroundColor: '#F5F7FA',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  summaryText: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyState: {
    alignItems: 'center',
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
  dateHeader: {
    paddingVertical: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  dateHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  logEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  logInfo: {
    flex: 1,
  },
  logUser: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  logTime: {
    fontSize: 13,
    color: '#888',
    marginTop: 1,
  },
  typeBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeWater: {
    backgroundColor: '#EBF5FB',
  },
  typeBadgeShot: {
    backgroundColor: '#FFF5EB',
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  typeBadgeTextWater: {
    color: '#4A90D9',
  },
  typeBadgeTextShot: {
    color: '#E67E22',
  },
  photoIcon: {
    marginLeft: 8,
  },
});
