import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { pickAndUploadDrinkPhoto } from '../utils/imageUpload';
import { playAcceptHaptic, playDeclineHaptic } from '../utils/sounds';
import { PingAnimation } from '../components/PingAnimation';

export function PendingScreen() {
  const { user } = useAuth();
  const [pings, setPings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [animation, setAnimation] = useState(null); // { type: 'water' | 'shot' }
  const [successMessage, setSuccessMessage] = useState(null);
  const successOpacity = useRef(new Animated.Value(0)).current;

  const fetchPendingPings = useCallback(async () => {
    const { data, error } = await supabase
      .from('drink_pings')
      .select(
        '*, sender:users!drink_pings_from_user_id_fkey(name, email), trip:trips(name)'
      )
      .eq('to_user_id', user.id)
      .in('status', ['pending', 'snoozed'])
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPings(data);
    }
    setLoading(false);
  }, [user.id]);

  useFocusEffect(
    useCallback(() => {
      fetchPendingPings();
    }, [fetchPendingPings])
  );

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('pending-pings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'drink_pings',
          filter: `to_user_id=eq.${user.id}`,
        },
        () => fetchPendingPings()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id, fetchPendingPings]);

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

    // Show animation
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

    // Insert drink log entry (without photo first)
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

    // Remove ping from list
    setPings((prev) => prev.filter((p) => p.id !== ping.id));
    setActionLoading(null);

    // Show success banner, then offer photo upload after a brief delay
    const emoji = ping.type === 'water' ? '💧' : '🍾';
    showSuccessBanner(`${emoji} Drink accepted!`);

    // Wait for banner to be visible before prompting photo
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Offer photo upload (non-blocking — drink is already logged)
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
          setPings((prev) => prev.filter((p) => p.id !== ping.id));
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
    setPings((prev) =>
      prev.map((p) =>
        p.id === ping.id
          ? { ...p, status: 'snoozed', snoozed_until: snoozedUntil, snooze_count: p.snooze_count + 1 }
          : p
      )
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPendingPings();
    setRefreshing(false);
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

  const renderPing = ({ item }) => {
    const isActioning = actionLoading === item.id;
    const isSnoozed = item.status === 'snoozed';
    const emoji = item.type === 'water' ? '💧' : '🍾';
    const senderName = item.sender?.name || item.sender?.email || 'Someone';
    const tripName = item.trip?.name || '';

    return (
      <View style={[styles.pingCard, isSnoozed && styles.pingCardSnoozed]}>
        <View style={styles.pingHeader}>
          <Text style={styles.pingEmoji}>{emoji}</Text>
          <View style={styles.pingInfo}>
            <Text style={styles.pingSender}>{senderName}</Text>
            <Text style={styles.pingMeta}>
              {tripName} · {formatTime(item.created_at)}
            </Text>
          </View>
          {isSnoozed && (
            <View style={styles.snoozedBadge}>
              <Ionicons name="time" size={12} color="#E67E22" />
              <Text style={styles.snoozedBadgeText}>Snoozed</Text>
            </View>
          )}
        </View>

        {isSnoozed && item.snoozed_until && (
          <View style={styles.snoozeInfo}>
            <Ionicons name="alarm-outline" size={14} color="#E67E22" />
            <Text style={styles.snoozeInfoText}>
              {formatSnoozeRemaining(item.snoozed_until)}
            </Text>
          </View>
        )}

        {item.sender_note && (
          <View style={styles.noteContainer}>
            <Text style={styles.noteText}>"{item.sender_note}"</Text>
          </View>
        )}

        {isActioning ? (
          <ActivityIndicator
            size="small"
            color="#4A90D9"
            style={styles.actionLoader}
          />
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => handleAccept(item)}
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
            {!isSnoozed && (
              <TouchableOpacity
                style={styles.snoozeButton}
                onPress={() => handleSnooze(item)}
              >
                <Ionicons name="time-outline" size={18} color="#E67E22" />
                <Text style={styles.snoozeText}>Later</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.declineButton}
              onPress={() => handleDecline(item)}
            >
              <Ionicons name="close" size={18} color="#E74C3C" />
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
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
      <FlatList
        data={pings}
        renderItem={renderPing}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          pings.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>All Clear!</Text>
            <Text style={styles.emptySubtitle}>
              No pending pings right now. Enjoy the calm.
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
  pingCard: {
    backgroundColor: '#F5F7FA',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  pingCardSnoozed: {
    backgroundColor: '#FFFAF3',
    borderWidth: 1,
    borderColor: '#F5DEB3',
  },
  snoozedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5EB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  snoozedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E67E22',
  },
  snoozeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5EB',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    gap: 6,
  },
  snoozeInfoText: {
    fontSize: 13,
    color: '#E67E22',
    fontWeight: '500',
  },
  pingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  pingEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  pingInfo: {
    flex: 1,
  },
  pingSender: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  pingMeta: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  noteContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  noteText: {
    fontSize: 14,
    color: '#555',
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27AE60',
    borderRadius: 10,
    paddingVertical: 12,
    gap: 4,
  },
  acceptText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  snoozeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5EB',
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E67E22',
    gap: 4,
  },
  snoozeText: {
    color: '#E67E22',
    fontSize: 15,
    fontWeight: '600',
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0EE',
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E74C3C',
    gap: 4,
  },
  declineText: {
    color: '#E74C3C',
    fontSize: 15,
    fontWeight: '600',
  },
  actionLoader: {
    paddingVertical: 14,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27AE60',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
  },
  successBannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
