import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

export function ScheduleRulesScreen({ route, navigation }) {
  const { user } = useAuth();
  const initialTripId = route.params?.tripId;
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(initialTripId || null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTrips = useCallback(async () => {
    const { data } = await supabase
      .from('trip_members')
      .select('trip_id, trips(id, name, status)')
      .eq('user_id', user.id);

    const activeTrips = (data || [])
      .map((tm) => tm.trips)
      .filter((t) => t && t.status === 'active');

    setTrips(activeTrips);
    return activeTrips;
  }, [user.id]);

  const fetchRules = useCallback(
    async (tripId) => {
      if (!tripId) return;

      const { data } = await supabase
        .from('scheduled_rules')
        .select(
          '*, recipient:users!scheduled_rules_to_user_id_fkey(name, email), sender:users!scheduled_rules_from_user_id_fkey(name, email)'
        )
        .eq('trip_id', tripId)
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      setRules(data || []);
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
      await fetchRules(tripId);
    }
    setLoading(false);
  }, [fetchTrips, fetchRules, selectedTripId]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    if (selectedTripId) await fetchRules(selectedTripId);
    setRefreshing(false);
  };

  const toggleActive = async (rule) => {
    const newActive = !rule.active;
    const { error } = await supabase
      .from('scheduled_rules')
      .update({ active: newActive })
      .eq('id', rule.id);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, active: newActive } : r))
    );
  };

  const deleteRule = (rule) => {
    Alert.alert(
      'Delete Schedule',
      'Are you sure you want to delete this recurring ping?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('scheduled_rules')
              .delete()
              .eq('id', rule.id);

            if (error) {
              Alert.alert('Error', error.message);
              return;
            }

            setRules((prev) => prev.filter((r) => r.id !== rule.id));
          },
        },
      ]
    );
  };

  const formatTime = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const formatInterval = (minutes) => {
    if (minutes < 60) return `Every ${minutes}m`;
    const hrs = minutes / 60;
    if (hrs === 1) return 'Every hour';
    return `Every ${hrs}h`;
  };

  const renderRule = ({ item }) => {
    const isSender = item.from_user_id === user.id;
    const otherName = isSender
      ? item.recipient?.name || item.recipient?.email || 'Unknown'
      : item.sender?.name || item.sender?.email || 'Unknown';
    const emoji = item.type === 'water' ? '💧' : '🥃';
    const directionText = isSender ? `→ ${otherName}` : `← ${otherName}`;

    return (
      <View style={[styles.ruleCard, !item.active && styles.ruleCardInactive]}>
        <View style={styles.ruleHeader}>
          <Text style={styles.ruleEmoji}>{emoji}</Text>
          <View style={styles.ruleInfo}>
            <Text style={styles.ruleTitle}>
              {item.type === 'water' ? 'Water' : 'Shot'} {directionText}
            </Text>
            <Text style={styles.ruleSchedule}>
              {formatInterval(item.interval_minutes)} · {formatTime(item.start_time)}–
              {formatTime(item.end_time)}
            </Text>
            {item.timezone && (
              <Text style={styles.ruleTimezone}>{item.timezone}</Text>
            )}
          </View>
          <Switch
            value={item.active}
            onValueChange={() => toggleActive(item)}
            trackColor={{ false: '#D1D5DB', true: 'rgba(255, 107, 107, 0.3)' }}
            thumbColor={item.active ? colors.cta : '#f4f3f4'}
          />
        </View>

        {isSender && (
          <View style={styles.ruleActions}>
            <TouchableOpacity
              style={styles.ruleActionBtn}
              onPress={() =>
                navigation.navigate('CreateScheduleRule', {
                  tripId: selectedTripId,
                  editRule: item,
                })
              }
            >
              <Ionicons name="pencil-outline" size={16} color={colors.cta} />
              <Text style={styles.ruleActionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ruleActionBtn}
              onPress={() => deleteRule(item)}
            >
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={[styles.ruleActionText, { color: colors.error }]}>
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
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
        <Ionicons name="timer-outline" size={64} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>No Active Trips</Text>
        <Text style={styles.emptySubtitle}>
          Join or create a trip to set up schedules.
        </Text>
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
                fetchRules(trip.id);
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

      <FlatList
        data={rules}
        renderItem={renderRule}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          rules.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="timer-outline" size={64} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Schedules</Text>
            <Text style={styles.emptySubtitle}>
              Set up recurring pings to keep your crew hydrated automatically.
            </Text>
          </View>
        }
      />

      {/* FAB to create new rule */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() =>
          navigation.navigate('CreateScheduleRule', {
            tripId: selectedTripId,
          })
        }
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
  },
  tripSelector: {
    maxHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tripSelectorContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  tripTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    marginRight: spacing.sm,
  },
  tripTabActive: {
    backgroundColor: colors.cta,
  },
  tripTabText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  tripTabTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
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
  ruleCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  ruleCardInactive: {
    opacity: 0.5,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ruleEmoji: {
    fontSize: 28,
    marginRight: spacing.md,
  },
  ruleInfo: {
    flex: 1,
  },
  ruleTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.navy,
  },
  ruleSchedule: {
    ...typography.caption,
    marginTop: 2,
  },
  ruleTimezone: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 1,
  },
  ruleActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.md,
    paddingTop: 10,
    gap: spacing.md,
  },
  ruleActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ruleActionText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.cta,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.cta,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.cardLg,
  },
});
