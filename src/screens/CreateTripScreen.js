import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

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

    const { data: trip, error: createError } = await supabase
      .from('trips')
      .insert({
        name: trimmed,
        start_date: today,
        created_by: user.id,
        invite_code: inviteCode,
      })
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create a Trip</Text>
      <Text style={styles.subtitle}>
        Start a new trip and invite friends to join.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Trip name (e.g. Cabo 2026)"
        value={name}
        onChangeText={setName}
        autoFocus
        maxLength={50}
      />

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
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingTop: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    marginBottom: 28,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fafafa',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#4A90D9',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
