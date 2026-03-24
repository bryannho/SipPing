import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function DrinkLogScreen({ route }) {
  const { user } = useAuth();
  const initialTripId = route.params?.tripId;
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(initialTripId || null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tripDropdownOpen, setTripDropdownOpen] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const listRef = React.useRef();

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

  const [signedUrls, setSignedUrls] = useState({});

  const fetchLogs = useCallback(async (tripId) => {
    if (!tripId) return;

    const { data } = await supabase
      .from('drink_log')
      .select('*, user:users!drink_log_user_id_fkey(name, email)')
      .eq('trip_id', tripId)
      .order('logged_at', { ascending: false });

    const rows = data || [];
    setLogs(rows);

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

    const emoji = item.type === 'shot' ? '🥃' : '💧';
    const userName = item.user?.name || item.user?.email || 'Unknown';
    const isCurrentUser = item.user_id === user.id;
    const timeStr = new Date(item.logged_at).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

    const hasPhoto = item.image_url && signedUrls[item.image_url];

    return (
      <View>
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
        </View>
        {hasPhoto && (
          <TouchableOpacity
            style={styles.photoContainer}
            onPress={() => {
              setImageLoading(true);
              setImageError(false);
              setViewingImage(signedUrls[item.image_url]);
            }}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: signedUrls[item.image_url] }}
              style={styles.photoThumbnail}
              resizeMode="cover"
            />
          </TouchableOpacity>
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

  const selectedTrip = trips.find((t) => t.id === selectedTripId) || trips[0];

  return (
    <View style={styles.container}>
      {/* Trip dropdown */}
      {trips.length > 1 && (
        <View style={styles.tripDropdownWrapper}>
          <TouchableOpacity
            style={styles.tripDropdown}
            onPress={() => setTripDropdownOpen(!tripDropdownOpen)}
          >
            <Text style={styles.tripIcon}>🌴</Text>
            <View style={styles.tripDropdownTextContainer}>
              <Text style={styles.tripDropdownText} numberOfLines={1}>
                {selectedTrip.name}
              </Text>
              {selectedTrip.status !== 'active' && (
                <Text style={styles.tripDropdownSubtitle}>Completed</Text>
              )}
            </View>
            <Ionicons
              name={tripDropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {tripDropdownOpen && (
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
                    fetchLogs(trip.id);
                    setTripDropdownOpen(false);
                    listRef.current?.scrollToOffset({ offset: 0, animated: true });
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
        </View>
      )}

      {/* Summary bar */}
      {logs.length > 0 && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>
            💧 {logs.filter((l) => l.type === 'water').length} waters
            {'  '}·{'  '}
            🥃 {logs.filter((l) => l.type === 'shot').length} shots
            {'  '}·{'  '}
            {logs.length} total
          </Text>
        </View>
      )}

      <FlatList
        ref={listRef}
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
            <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Drinks Logged</Text>
            <Text style={styles.emptySubtitle}>
              Accept some pings to see your drink history here.
            </Text>
          </View>
        }
      />

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
  },
  tripDropdownWrapper: {
    padding: spacing.md,
  },
  tripDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.md,
    ...shadows.card,
  },
  tripIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  tripDropdownTextContainer: {
    flex: 1,
  },
  tripDropdownText: {
    ...typography.h2,
  },
  tripDropdownSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.success,
    marginTop: 2,
  },
  tripDropdownMenu: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    marginTop: spacing.sm,
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
  summaryBar: {
    backgroundColor: colors.card,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
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
  dateHeader: {
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  dateHeaderText: {
    fontFamily: fonts.headingMedium,
    fontSize: 14,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 6,
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
    marginBottom: 6,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  photoThumbnail: {
    width: '100%',
    aspectRatio: 3 / 4,
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
