import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const INTERVAL_OPTIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function CreateScheduleRuleScreen({ route, navigation }) {
  const { user } = useAuth();
  const { tripId, editRule } = route.params || {};
  const isEditing = !!editRule;

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
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTimePicker, setShowTimePicker] = useState(null); // 'start' | 'end' | null

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
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
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
            color="#ccc"
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

      {/* Summary */}
      <View style={styles.summaryCard}>
        <Ionicons name="information-circle-outline" size={18} color="#4A90D9" />
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
                        color="#4A90D9"
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
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeButton: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  timeArrow: {
    marginHorizontal: 4,
  },
  timezoneText: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 8,
    textAlign: 'center',
  },
  intervalRow: {
    flexDirection: 'row',
    gap: 8,
  },
  intervalChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F5F7FA',
    alignItems: 'center',
  },
  intervalChipActive: {
    backgroundColor: '#4A90D9',
  },
  intervalChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  intervalChipTextActive: {
    color: '#fff',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EBF2FA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  summaryText: {
    flex: 1,
    fontSize: 14,
    color: '#4A90D9',
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#4A90D9',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '80%',
    maxHeight: '60%',
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
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
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  hourOptionActive: {
    backgroundColor: '#EBF2FA',
  },
  hourOptionText: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  hourOptionTextActive: {
    color: '#4A90D9',
    fontWeight: '600',
  },
});
