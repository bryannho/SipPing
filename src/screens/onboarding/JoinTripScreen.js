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
import { colors, fonts, radii, spacing, typography } from '../../theme';

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
        placeholderTextColor={colors.textTertiary}
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
    fontSize: 20,
    color: colors.navy,
    textAlign: 'center',
    letterSpacing: 4,
    backgroundColor: colors.card,
    marginBottom: spacing.lg,
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
