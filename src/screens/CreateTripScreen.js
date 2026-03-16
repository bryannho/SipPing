import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function CreateTripScreen({ navigation }) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [endDate, setEndDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter a trip name.');
      return;
    }

    setLoading(true);

    const inviteCode = generateInviteCode();
    const today = new Date().toISOString().split('T')[0];

    const insertData = {
      name: trimmed,
      start_date: today,
      created_by: user.id,
      invite_code: inviteCode,
    };

    if (endDate) {
      insertData.end_date = endDate.toISOString().split('T')[0];
    }

    const { data: trip, error: createError } = await supabase
      .from('trips')
      .insert(insertData)
      .select()
      .single();

    if (createError) {
      setLoading(false);
      if (
        createError.code === '23505' &&
        createError.message.includes('invite_code')
      ) {
        return handleCreate();
      }
      Alert.alert('Error', createError.message);
      return;
    }

    await supabase
      .from('trip_members')
      .insert({ trip_id: trip.id, user_id: user.id });

    setLoading(false);

    navigation.replace('TripDetail', {
      tripId: trip.id,
      tripName: trip.name,
      inviteCode: trip.invite_code,
      isNew: true,
    });
  };

  const formatDate = (date) =>
    date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create a Trip</Text>
      <Text style={styles.subtitle}>
        Start a new trip and invite friends to join.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Trip name (e.g. Cabo 2026)"
        placeholderTextColor={colors.textTertiary}
        value={name}
        onChangeText={setName}
        autoFocus
        maxLength={50}
      />

      <Text style={styles.fieldLabel}>End date (optional)</Text>
      <TouchableOpacity
        style={styles.dateButton}
        onPress={() => setShowDatePicker(true)}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
        <Text style={endDate ? styles.dateText : styles.datePlaceholder}>
          {endDate ? formatDate(endDate) : 'No end date'}
        </Text>
        {endDate && (
          <TouchableOpacity
            onPress={() => setEndDate(null)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {showDatePicker && (
        <DateTimePicker
          value={endDate || tomorrow}
          mode="date"
          minimumDate={tomorrow}
          onChange={(event, selected) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (selected) setEndDate(selected);
          }}
        />
      )}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Creating...' : 'Create Trip'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    paddingTop: 40,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.caption,
    marginBottom: 28,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.navy,
    backgroundColor: colors.card,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    backgroundColor: colors.card,
    marginBottom: spacing.lg,
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
  button: {
    backgroundColor: colors.cta,
    borderRadius: radii.md,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 17,
  },
});
