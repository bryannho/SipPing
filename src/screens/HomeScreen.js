import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../hooks/useAuth';

export function HomeScreen({ navigation }) {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home</Text>
      <Text style={styles.subtitle}>Welcome to SipPing</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <TouchableOpacity
        style={styles.joinButton}
        onPress={() => navigation.navigate('JoinTrip')}
      >
        <Text style={styles.joinButtonText}>Join a Trip</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 8,
  },
  email: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 32,
  },
  joinButton: {
    backgroundColor: '#4A90D9',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    paddingVertical: 12,
  },
  signOutText: {
    color: '#E74C3C',
    fontSize: 15,
    fontWeight: '500',
  },
});
