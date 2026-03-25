import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Share,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

export function TripDetailScreen({ route, navigation }) {
  const { tripId, tripName, inviteCode, isNew } = route.params;
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEndDate, setEditEndDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTripDetails();
  }, []);

  const fetchTripDetails = async () => {
    const [tripResult, membersResult] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).single(),
      supabase
        .from('trip_members')
        .select('user_id, joined_at, users(name, email)')
        .eq('trip_id', tripId),
    ]);

    if (tripResult.data) setTrip(tripResult.data);
    if (membersResult.data) setMembers(membersResult.data);
    setLoading(false);
  };

  const handleShare = async () => {
    const code = trip?.invite_code || inviteCode;
    const link = Linking.createURL('join-trip', {
      queryParams: { code },
    });
    await Share.share({
      message: `Join my trip "${trip?.name || tripName}" on SipPing! Use invite code: ${code}\n\n${link}`,
    });
  };

  const handleEndTrip = () => {
    Alert.alert(
      'End Trip',
      'Are you sure? This will end the trip for everyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Trip',
          style: 'destructive',
          onPress: async () => {
            await Promise.all([
              supabase
                .from('trips')
                .update({ status: 'completed' })
                .eq('id', tripId),
              supabase
                .from('scheduled_rules')
                .update({ active: false })
                .eq('trip_id', tripId),
              supabase
                .from('drink_pings')
                .update({ status: 'declined', response_note: 'Trip ended', responded_at: new Date().toISOString() })
                .eq('trip_id', tripId)
                .in('status', ['pending', 'snoozed']),
            ]);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const isCreator = trip?.created_by === user.id;
  const isActive = trip?.status === 'active';

  const startEditing = () => {
    setEditName(trip.name);
    setEditEndDate(trip.end_date ? new Date(trip.end_date + 'T00:00:00') : null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setShowDatePicker(false);
  };

  const handleSaveEdit = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Trip name cannot be empty.');
      return;
    }

    setSaving(true);
    const updateData = { name: trimmed };
    updateData.end_date = editEndDate
      ? editEndDate.toISOString().split('T')[0]
      : null;

    const { error } = await supabase
      .from('trips')
      .update(updateData)
      .eq('id', tripId);

    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setTrip((prev) => ({ ...prev, ...updateData }));
    setEditing(false);
    setShowDatePicker(false);
  };

  const formatDate = (date) =>
    date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const renderMember = ({ item }) => (
    <View style={styles.memberRow}>
      <View style={styles.memberAvatar}>
        <Text style={styles.memberInitial}>
          {(item.users?.name || item.users?.email || '?')[0].toUpperCase()}
        </Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>
          {item.users?.name || item.users?.email || 'Unknown'}
        </Text>
        {item.users?.name && (
          <Text style={styles.memberEmail}>{item.users.email}</Text>
        )}
      </View>
      {item.user_id === user.id && (
        <Text style={styles.youBadge}>You</Text>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isNew && (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.successText}>
            Trip created! Share the invite code below.
          </Text>
        </View>
      )}

      <View style={styles.codeSection}>
        <Text style={styles.codeLabel}>Invite Code</Text>
        <Text style={styles.codeValue}>
          {trip?.invite_code || inviteCode}
        </Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={18} color="#fff" />
          <Text style={styles.shareButtonText}>Share Invite</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.infoTile}>
          <Text style={styles.infoTileValue}>
            {trip?.start_date
              ? new Date(trip.start_date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })
              : '—'}
          </Text>
          <Text style={styles.infoTileLabel}>Started</Text>
        </View>
        {trip?.end_date && (
          <View style={styles.infoTile}>
            <Text style={styles.infoTileValue}>
              {new Date(trip.end_date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </Text>
            <Text style={styles.infoTileLabel}>Ends</Text>
          </View>
        )}
        <View style={styles.infoTile}>
          <Text
            style={[
              styles.infoTileValue,
              trip?.status === 'active' && styles.statusActive,
            ]}
          >
            {trip?.status ? trip.status.charAt(0).toUpperCase() + trip.status.slice(1) : 'Active'}
          </Text>
          <Text style={styles.infoTileLabel}>Status</Text>
        </View>
      </View>

      {!editing && isCreator && isActive && (
        <TouchableOpacity style={styles.editButton} onPress={startEditing}>
          <Ionicons name="pencil" size={16} color={colors.cta} />
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
      )}

      {editing ? (
        <View style={styles.editSection}>
          <Text style={styles.fieldLabel}>Trip Name</Text>
          <TextInput
            style={styles.editInput}
            value={editName}
            onChangeText={setEditName}
            maxLength={50}
            autoFocus
          />

          <Text style={styles.fieldLabel}>End Date (optional)</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
            <Text style={editEndDate ? styles.dateText : styles.datePlaceholder}>
              {editEndDate ? formatDate(editEndDate) : 'No end date'}
            </Text>
            {editEndDate && (
              <TouchableOpacity
                onPress={() => setEditEndDate(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={editEndDate || tomorrow}
              mode="date"
              minimumDate={tomorrow}
              onChange={(event, selected) => {
                setShowDatePicker(Platform.OS === 'ios');
                if (selected) setEditEndDate(selected);
              }}
            />
          )}

          <View style={styles.editActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={cancelEditing}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={handleSaveEdit}
              disabled={saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>
        Members ({members.length})
      </Text>
      <FlatList
        data={members}
        renderItem={renderMember}
        keyExtractor={(item) => item.user_id}
        style={styles.membersList}
      />

      {isCreator && isActive && !editing && (
        <TouchableOpacity style={styles.endButton} onPress={handleEndTrip}>
          <Text style={styles.endButtonText}>End Trip</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  loadingText: {
    ...typography.caption,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 125, 0.1)',
    borderRadius: radii.md,
    padding: 14,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  successText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.success,
    flex: 1,
  },
  codeSection: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  codeLabel: {
    ...typography.label,
    marginBottom: 6,
    letterSpacing: 1,
  },
  codeValue: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: colors.navy,
    letterSpacing: 6,
    marginBottom: spacing.md,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cta,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 6,
  },
  shareButtonText: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  infoTile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  infoTileValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.navy,
    marginBottom: 4,
  },
  infoTileLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  statusActive: {
    color: colors.success,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  membersList: {
    flex: 1,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.lavender,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  memberInitial: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 17,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.navy,
  },
  memberEmail: {
    ...typography.caption,
    fontSize: 13,
    marginTop: 2,
  },
  youBadge: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.cta,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
    marginBottom: spacing.lg,
  },
  editButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.cta,
  },
  editSection: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  fieldLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
  },
  editInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.navy,
    backgroundColor: colors.bg,
    marginBottom: spacing.md,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    backgroundColor: colors.bg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  dateText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.navy,
  },
  datePlaceholder: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.textTertiary,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.cta,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
  endButton: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radii.md,
    padding: 14,
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  endButtonText: {
    color: colors.error,
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
});
