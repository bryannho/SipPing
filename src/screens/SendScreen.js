import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { sendDrinkPingNotification } from '../utils/pushNotifications';
import { playSendSound } from '../utils/sounds';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

const SCHEDULE_OPTIONS = [
  { label: 'Now', value: 0 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
];

export function SendScreen({ route, navigation }) {
  const { user } = useAuth();
  const tabBarHeight = useBottomTabBarHeight();
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [members, setMembers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [drinkType, setDrinkType] = useState('water');
  const [note, setNote] = useState('');
  const [scheduleDelay, setScheduleDelay] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    if (route.params?.tripId) setSelectedTripId(route.params.tripId);
    if (route.params?.toUserId) setSelectedUserId(route.params.toUserId);
    if (route.params?.drinkType) setDrinkType(route.params.drinkType);
  }, [route.params]);

  useEffect(() => {
    const fetchTrips = async () => {
      const { data } = await supabase
        .from('trip_members')
        .select('trip_id, trips(id, name, status)')
        .eq('user_id', user.id);

      const activeTrips = (data || [])
        .map((tm) => tm.trips)
        .filter((t) => t && t.status === 'active');

      setTrips(activeTrips);

      if (!selectedTripId && activeTrips.length > 0) {
        setSelectedTripId(activeTrips[0].id);
      }
      setLoading(false);
    };

    fetchTrips();
  }, [user.id]);

  useEffect(() => {
    if (!selectedTripId) return;

    const fetchMembers = async () => {
      const { data } = await supabase
        .from('trip_members')
        .select('user_id, users(id, name, email, expo_push_token)')
        .eq('trip_id', selectedTripId);

      const otherMembers = (data || [])
        .map((m) => m.users)
        .filter((u) => u && u.id !== user.id);

      setMembers(otherMembers);

      if (
        otherMembers.length === 1 &&
        !route.params?.toUserId
      ) {
        setSelectedUserId(otherMembers[0].id);
      }
    };

    fetchMembers();
  }, [selectedTripId, user.id]);

  const handleSend = async () => {
    if (!selectedTripId) {
      Alert.alert('Error', 'Please select a trip.');
      return;
    }
    if (!selectedUserId) {
      Alert.alert('Error', 'Please select a person to ping.');
      return;
    }

    setSending(true);

    const scheduledAt =
      scheduleDelay > 0
        ? new Date(Date.now() + scheduleDelay * 60 * 1000).toISOString()
        : null;

    const { data: ping, error } = await supabase
      .from('drink_pings')
      .insert({
        trip_id: selectedTripId,
        from_user_id: user.id,
        to_user_id: selectedUserId,
        type: drinkType,
        sender_note: note.trim() || null,
        scheduled_at: scheduledAt,
      })
      .select('id')
      .single();

    if (error) {
      setSending(false);
      Alert.alert('Error', error.message);
      return;
    }

    const recipient = members.find((m) => m.id === selectedUserId);
    if (!scheduledAt && recipient?.expo_push_token) {
      const { data: senderProfile } = await supabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .single();

      await sendDrinkPingNotification(
        recipient.expo_push_token,
        senderProfile?.name || user.email,
        drinkType,
        ping.id,
        note.trim() || null
      );
    }

    setSending(false);
    await playSendSound();

    const emoji = drinkType === 'water' ? '💧' : '🥃';
    const recipientName = recipient?.name || recipient?.email || 'them';
    const scheduleMsg = scheduledAt
      ? ` (scheduled for ${scheduleDelay >= 60 ? `${scheduleDelay / 60}h` : `${scheduleDelay}m`} from now)`
      : '';
    Alert.alert('Sent!', `${emoji} Ping sent to ${recipientName}!${scheduleMsg}`, [
      {
        text: 'OK',
        onPress: () => {
          setNote('');
          setScheduleDelay(0);
          navigation.setParams({
            tripId: undefined,
            toUserId: undefined,
            toUserName: undefined,
            drinkType: undefined,
          });
        },
      },
    ]);
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
        <Ionicons name="airplane-outline" size={48} color={colors.textTertiary} />
        <Text style={styles.emptyText}>
          Join or create a trip first to send pings.
        </Text>
      </View>
    );
  }

  const selectedTrip = trips.find((t) => t.id === selectedTripId) || trips[0];

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, keyboardHeight > 0 && { paddingBottom: keyboardHeight - tabBarHeight + spacing.md }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Screen title */}
      <Text style={styles.screenTitle}>Send a Ping</Text>

      {/* Trip selector */}
      {trips.length > 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Trip</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {trips.map((trip) => (
              <TouchableOpacity
                key={trip.id}
                style={[
                  styles.chip,
                  trip.id === selectedTripId && styles.chipActive,
                ]}
                onPress={() => {
                  setSelectedTripId(trip.id);
                  setSelectedUserId(null);
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    trip.id === selectedTripId && styles.chipTextActive,
                  ]}
                >
                  {trip.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Person selector */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Send to</Text>
        {members.length === 0 ? (
          <Text style={styles.noMembers}>
            No other members in this trip yet.
          </Text>
        ) : (
          members.map((member) => (
            <TouchableOpacity
              key={member.id}
              style={[
                styles.personRow,
                member.id === selectedUserId && styles.personRowActive,
              ]}
              onPress={() => setSelectedUserId(member.id)}
            >
              <View
                style={[
                  styles.personAvatar,
                  member.id === selectedUserId && styles.personAvatarActive,
                ]}
              >
                <Text style={styles.personInitial}>
                  {(member.name || member.email || '?')[0].toUpperCase()}
                </Text>
              </View>
              <Text
                style={[
                  styles.personName,
                  member.id === selectedUserId && styles.personNameActive,
                ]}
              >
                {member.name || member.email}
              </Text>
              {member.id === selectedUserId && (
                <Ionicons name="checkmark-circle" size={22} color={colors.cta} />
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Drink type */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Type</Text>
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[
              styles.typeCard,
              drinkType === 'water' && styles.typeCardWaterActive,
            ]}
            onPress={() => setDrinkType('water')}
          >
            <Text style={styles.typeEmoji}>💧</Text>
            <Text
              style={[
                styles.typeText,
                drinkType === 'water' && styles.typeTextWaterActive,
              ]}
            >
              Water
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.typeCard,
              drinkType === 'shot' && styles.typeCardShotActive,
            ]}
            onPress={() => setDrinkType('shot')}
          >
            <Text style={styles.typeEmoji}>🥃</Text>
            <Text
              style={[
                styles.typeText,
                drinkType === 'shot' && styles.typeTextShotActive,
              ]}
            >
              Shot
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Optional note */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Note (optional)</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Stay hydrated! 🤙"
          placeholderTextColor={colors.textTertiary}
          value={note}
          onChangeText={setNote}
          maxLength={200}
          multiline
          blurOnSubmit={true}
          returnKeyType="done"
          onFocus={() => {
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
          }}
        />
      </View>

      {/* Schedule timing */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>When</Text>
        <View style={styles.scheduleRow}>
          {SCHEDULE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.scheduleChip,
                scheduleDelay === opt.value && styles.scheduleChipActive,
              ]}
              onPress={() => setScheduleDelay(opt.value)}
            >
              <Text
                style={[
                  styles.scheduleChipText,
                  scheduleDelay === opt.value && styles.scheduleChipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {scheduleDelay > 0 && (
          <Text style={styles.scheduleNote}>
            Will be sent in {scheduleDelay >= 60 ? `${scheduleDelay / 60} hour${scheduleDelay > 60 ? 's' : ''}` : `${scheduleDelay} minutes`}
          </Text>
        )}
      </View>

      {/* Send button */}
      <TouchableOpacity
        style={[styles.sendButton, sending && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={sending}
      >
        <Text style={styles.sendButtonText}>
          {sending
            ? 'Sending...'
            : scheduleDelay > 0
              ? `Schedule ${drinkType === 'water' ? '💧' : '🥃'} Ping`
              : `Send ${drinkType === 'water' ? '💧' : '🥃'} Ping`}
        </Text>
      </TouchableOpacity>
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
    paddingBottom: 40,
  },
  screenTitle: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.navy,
    marginBottom: spacing.xs,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.label,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    marginRight: spacing.sm,
    ...shadows.card,
  },
  chipActive: {
    backgroundColor: colors.cta,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: '#fff',
  },
  noMembers: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  personRowActive: {
    borderWidth: 1.5,
    borderColor: colors.cta,
  },
  personAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.textTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  personAvatarActive: {
    backgroundColor: colors.lavender,
  },
  personInitial: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
  personName: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.navy,
  },
  personNameActive: {
    color: colors.cta,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  typeCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadows.card,
  },
  typeCardWaterActive: {
    borderColor: colors.teal,
    backgroundColor: 'rgba(46, 196, 182, 0.08)',
  },
  typeCardShotActive: {
    borderColor: colors.amber,
    backgroundColor: 'rgba(232, 148, 90, 0.08)',
  },
  typeEmoji: {
    fontSize: 36,
    marginBottom: 6,
  },
  typeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.textSecondary,
  },
  typeTextWaterActive: {
    color: colors.teal,
  },
  typeTextShotActive: {
    color: colors.amber,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.navy,
    backgroundColor: colors.card,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  scheduleChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    ...shadows.card,
  },
  scheduleChipActive: {
    backgroundColor: colors.cta,
  },
  scheduleChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  scheduleChipTextActive: {
    color: '#fff',
  },
  scheduleNote: {
    ...typography.caption,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  sendButton: {
    backgroundColor: colors.cta,
    borderRadius: radii.md,
    padding: 18,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#fff',
    fontFamily: fonts.heading,
    fontSize: 18,
  },
});
