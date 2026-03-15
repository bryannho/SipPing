import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { sendDrinkPingNotification } from '../utils/pushNotifications';
import { playSendSound } from '../utils/sounds';

const SCHEDULE_OPTIONS = [
  { label: 'Now', value: 0 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '2h', value: 120 },
];

export function SendScreen({ route, navigation }) {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [members, setMembers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [drinkType, setDrinkType] = useState('water');
  const [note, setNote] = useState('');
  const [scheduleDelay, setScheduleDelay] = useState(0);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  // Apply params from quick-send
  useEffect(() => {
    if (route.params?.tripId) setSelectedTripId(route.params.tripId);
    if (route.params?.toUserId) setSelectedUserId(route.params.toUserId);
    if (route.params?.drinkType) setDrinkType(route.params.drinkType);
  }, [route.params]);

  // Fetch user's active trips
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

  // Fetch members when trip changes
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

      // Auto-select if only one member or if pre-selected
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

    // Send push notification immediately only if not scheduled
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
        ping.id
      );
    }

    setSending(false);
    await playSendSound();

    const emoji = drinkType === 'water' ? '💧' : '🍾';
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
          // Clear params so screen resets on next visit
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
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  if (trips.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="airplane-outline" size={48} color="#ccc" />
        <Text style={styles.emptyText}>
          Join or create a trip first to send pings.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
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
                <Ionicons name="checkmark-circle" size={22} color="#4A90D9" />
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
              drinkType === 'water' && styles.typeCardActive,
            ]}
            onPress={() => setDrinkType('water')}
          >
            <Text style={styles.typeEmoji}>💧</Text>
            <Text
              style={[
                styles.typeText,
                drinkType === 'water' && styles.typeTextActive,
              ]}
            >
              Water
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.typeCard,
              drinkType === 'shot' && styles.typeCardActive,
            ]}
            onPress={() => setDrinkType('shot')}
          >
            <Text style={styles.typeEmoji}>🍾</Text>
            <Text
              style={[
                styles.typeText,
                drinkType === 'shot' && styles.typeTextActive,
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
          value={note}
          onChangeText={setNote}
          maxLength={200}
          multiline
          blurOnSubmit={true}
          returnKeyType="done"
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
              ? `Schedule ${drinkType === 'water' ? '💧' : '🍾'} Ping`
              : `Send ${drinkType === 'water' ? '💧' : '🍾'} Ping`}
        </Text>
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
  emptyText: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    marginTop: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#4A90D9',
  },
  chipText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  chipTextActive: {
    color: '#fff',
  },
  noMembers: {
    fontSize: 14,
    color: '#aaa',
    fontStyle: 'italic',
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F5F7FA',
    marginBottom: 8,
  },
  personRowActive: {
    backgroundColor: '#EBF2FA',
    borderWidth: 1.5,
    borderColor: '#4A90D9',
  },
  personAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  personAvatarActive: {
    backgroundColor: '#4A90D9',
  },
  personInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  personName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  personNameActive: {
    color: '#4A90D9',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    borderRadius: 14,
    backgroundColor: '#F5F7FA',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeCardActive: {
    borderColor: '#4A90D9',
    backgroundColor: '#EBF2FA',
  },
  typeEmoji: {
    fontSize: 36,
    marginBottom: 6,
  },
  typeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  typeTextActive: {
    color: '#4A90D9',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    backgroundColor: '#fafafa',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scheduleChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F5F7FA',
    alignItems: 'center',
  },
  scheduleChipActive: {
    backgroundColor: '#4A90D9',
  },
  scheduleChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  scheduleChipTextActive: {
    color: '#fff',
  },
  scheduleNote: {
    fontSize: 13,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  sendButton: {
    backgroundColor: '#4A90D9',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
