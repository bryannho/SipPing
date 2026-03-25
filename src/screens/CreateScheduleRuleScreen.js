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
  Modal,
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

const INTERVAL_OPTIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function CreateScheduleRuleScreen({ route, navigation }) {
  const { user } = useAuth();
  const tabBarHeight = useBottomTabBarHeight();
  const { tripId, editRule } = route.params || {};
  const isEditing = !!editRule;
  const scrollRef = useRef(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const [members, setMembers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(
    editRule?.to_user_id || null
  );
  const [drinkType, setDrinkType] = useState(editRule?.type || 'water');
  const [startHour, setStartHour] = useState(
    editRule ? parseInt(editRule.start_time.split(':')[0], 10) : 9
  );
  const [endHour, setEndHour] = useState(
    editRule ? parseInt(editRule.end_time.split(':')[0], 10) : 22
  );
  const [intervalMinutes, setIntervalMinutes] = useState(
    editRule?.interval_minutes || 60
  );
  const [timezone, setTimezone] = useState(
    editRule?.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      'America/New_York'
  );
  const [senderNote, setSenderNote] = useState(editRule?.sender_note || '');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTimePicker, setShowTimePicker] = useState(null);

  useEffect(() => {
    const fetchMembers = async () => {
      const { data } = await supabase
        .from('trip_members')
        .select('user_id, users(id, name, email)')
        .eq('trip_id', tripId);

      const otherMembers = (data || [])
        .map((m) => m.users)
        .filter((u) => u && u.id !== user.id);

      setMembers(otherMembers);

      if (otherMembers.length === 1 && !selectedUserId) {
        setSelectedUserId(otherMembers[0].id);
      }
      setLoading(false);
    };

    fetchMembers();
  }, [tripId, user.id]);

  const formatHour = (h) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayH}:00 ${ampm}`;
  };

  const handleSave = async () => {
    if (!selectedUserId) {
      Alert.alert('Error', 'Please select a person.');
      return;
    }
    if (startHour >= endHour) {
      Alert.alert('Error', 'Start time must be before end time.');
      return;
    }

    setSaving(true);

    const startTime = `${startHour.toString().padStart(2, '0')}:00`;
    const endTime = `${endHour.toString().padStart(2, '0')}:00`;

    if (isEditing) {
      const { error } = await supabase
        .from('scheduled_rules')
        .update({
          to_user_id: selectedUserId,
          type: drinkType,
          start_time: startTime,
          end_time: endTime,
          interval_minutes: intervalMinutes,
          timezone,
          sender_note: senderNote.trim() || null,
        })
        .eq('id', editRule.id);

      setSaving(false);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      Alert.alert('Updated', 'Schedule updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } else {
      const { error } = await supabase.from('scheduled_rules').insert({
        trip_id: tripId,
        from_user_id: user.id,
        to_user_id: selectedUserId,
        type: drinkType,
        start_time: startTime,
        end_time: endTime,
        interval_minutes: intervalMinutes,
        timezone,
        sender_note: senderNote.trim() || null,
      });

      setSaving(false);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      Alert.alert('Created', 'Recurring ping schedule created!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.cta} />
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, keyboardHeight > 0 && { paddingBottom: keyboardHeight - tabBarHeight + spacing.md }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Person selector */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Send to</Text>
        {members.length === 0 ? (
          <Text style={styles.noMembers}>No other members in this trip.</Text>
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

      {/* Time range */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Active hours</Text>
        <View style={styles.timeRow}>
          <TouchableOpacity
            style={styles.timeButton}
            onPress={() => setShowTimePicker('start')}
          >
            <Text style={styles.timeLabel}>From</Text>
            <Text style={styles.timeValue}>{formatHour(startHour)}</Text>
          </TouchableOpacity>
          <Ionicons
            name="arrow-forward"
            size={20}
            color={colors.textTertiary}
            style={styles.timeArrow}
          />
          <TouchableOpacity
            style={styles.timeButton}
            onPress={() => setShowTimePicker('end')}
          >
            <Text style={styles.timeLabel}>Until</Text>
            <Text style={styles.timeValue}>{formatHour(endHour)}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.timezoneText}>Timezone: {timezone}</Text>
      </View>

      {/* Interval */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Frequency</Text>
        <View style={styles.intervalRow}>
          {INTERVAL_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.intervalChip,
                intervalMinutes === opt.value && styles.intervalChipActive,
              ]}
              onPress={() => setIntervalMinutes(opt.value)}
            >
              <Text
                style={[
                  styles.intervalChipText,
                  intervalMinutes === opt.value && styles.intervalChipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Optional message */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Message (optional)</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Stay hydrated!"
          placeholderTextColor={colors.textTertiary}
          value={senderNote}
          onChangeText={setSenderNote}
          maxLength={200}
          multiline
          blurOnSubmit={true}
          returnKeyType="done"
          onFocus={() => {
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
          }}
        />
      </View>

      {/* Summary */}
      <View style={styles.summaryCard}>
        <Ionicons name="information-circle-outline" size={18} color={colors.cta} />
        <Text style={styles.summaryText}>
          This will send a {drinkType} ping every {intervalMinutes < 60 ? `${intervalMinutes} minutes` : `${intervalMinutes / 60} hour${intervalMinutes > 60 ? 's' : ''}`} between{' '}
          {formatHour(startHour)} and {formatHour(endHour)}.
        </Text>
      </View>

      {/* Save button */}
      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>
          {saving ? 'Saving...' : isEditing ? 'Update Schedule' : 'Create Schedule'}
        </Text>
      </TouchableOpacity>

      {/* Time picker modal */}
      <Modal
        visible={showTimePicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimePicker(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTimePicker(null)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {showTimePicker === 'start' ? 'Start Time' : 'End Time'}
            </Text>
            <ScrollView
              style={styles.hourList}
              showsVerticalScrollIndicator={false}
            >
              {HOURS.map((h) => {
                const isSelected =
                  showTimePicker === 'start' ? h === startHour : h === endHour;
                return (
                  <TouchableOpacity
                    key={h}
                    style={[
                      styles.hourOption,
                      isSelected && styles.hourOptionActive,
                    ]}
                    onPress={() => {
                      if (showTimePicker === 'start') setStartHour(h);
                      else setEndHour(h);
                      setShowTimePicker(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.hourOptionText,
                        isSelected && styles.hourOptionTextActive,
                      ]}
                    >
                      {formatHour(h)}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color={colors.cta}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.label,
    marginBottom: 10,
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
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  timeButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  timeLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  timeValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 18,
    color: colors.navy,
  },
  timeArrow: {
    marginHorizontal: spacing.xs,
  },
  timezoneText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  intervalRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  intervalChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    ...shadows.card,
  },
  intervalChipActive: {
    backgroundColor: colors.cta,
  },
  intervalChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  intervalChipTextActive: {
    color: '#fff',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
    borderRadius: radii.md,
    padding: 14,
    marginBottom: spacing.lg,
    gap: 10,
  },
  summaryText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.cta,
    lineHeight: 20,
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
  saveButton: {
    backgroundColor: colors.cta,
    borderRadius: radii.md,
    padding: 18,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontFamily: fonts.heading,
    fontSize: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    width: '80%',
    maxHeight: '60%',
    padding: spacing.lg,
  },
  modalTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  hourList: {
    maxHeight: 300,
  },
  hourOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  hourOptionActive: {
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
  },
  hourOptionText: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.navy,
  },
  hourOptionTextActive: {
    color: colors.cta,
    fontFamily: fonts.bodySemiBold,
  },
});
