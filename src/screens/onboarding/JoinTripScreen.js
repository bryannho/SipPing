import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

export function JoinTripScreen({ route, navigation }) {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (route.params?.code) {
      setCode(route.params.code);
    }
  }, [route.params?.code]);

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter an invite code.');
      return;
    }

    setLoading(true);

    const { data: trip, error: lookupError } = await supabase
      .from('trips')
      .select('id')
      .eq('invite_code', trimmed)
      .single();

    if (lookupError || !trip) {
      setLoading(false);
      Alert.alert('Invalid Code', 'No trip found with that invite code.');
      return;
    }

    const { error: joinError } = await supabase
      .from('trip_members')
      .insert({ trip_id: trip.id, user_id: user.id });

    setLoading(false);

    if (joinError) {
      if (joinError.code === '23505') {
        Alert.alert('Already Joined', 'You are already a member of this trip.');
      } else {
        Alert.alert('Error', joinError.message);
      }
      return;
    }

    Alert.alert('Joined!', 'You have joined the trip.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join a Trip</Text>
      <Text style={styles.subtitle}>
        Enter the invite code shared by your trip partner.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Invite code (e.g. ABC123)"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        maxLength={8}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleJoin}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Joining...' : 'Join Trip'}
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
    fontSize: 20,
    textAlign: 'center',
    letterSpacing: 4,
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
