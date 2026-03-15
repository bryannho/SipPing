import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export function TripDetailScreen({ route, navigation }) {
  const { tripId, tripName, inviteCode, isNew } = route.params;
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);

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
            await supabase
              .from('trips')
              .update({ status: 'completed' })
              .eq('id', tripId);
            navigation.goBack();
          },
        },
      ]
    );
  };

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
          <Ionicons name="checkmark-circle" size={18} color="#27AE60" />
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

      <View style={styles.infoSection}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Started</Text>
          <Text style={styles.infoValue}>
            {trip?.start_date
              ? new Date(trip.start_date + 'T00:00:00').toLocaleDateString()
              : '—'}
          </Text>
        </View>
        {trip?.end_date && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Ends</Text>
            <Text style={styles.infoValue}>
              {new Date(trip.end_date + 'T00:00:00').toLocaleDateString()}
            </Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status</Text>
          <Text
            style={[
              styles.infoValue,
              trip?.status === 'active' && styles.statusActive,
            ]}
          >
            {trip?.status || 'active'}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        Members ({members.length})
      </Text>
      <FlatList
        data={members}
        renderItem={renderMember}
        keyExtractor={(item) => item.user_id}
        style={styles.membersList}
      />

      {trip?.created_by === user.id && trip?.status === 'active' && (
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
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    fontSize: 15,
    color: '#aaa',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F8F0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  successText: {
    fontSize: 14,
    color: '#27AE60',
    fontWeight: '500',
    flex: 1,
  },
  codeSection: {
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 14,
    padding: 24,
    marginBottom: 20,
  },
  codeLabel: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  codeValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: 6,
    marginBottom: 16,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A90D9',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 6,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  infoSection: {
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  infoLabel: {
    fontSize: 15,
    color: '#888',
  },
  infoValue: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  statusActive: {
    color: '#27AE60',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  membersList: {
    flex: 1,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4A90D9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberInitial: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  memberEmail: {
    fontSize: 13,
    color: '#aaa',
    marginTop: 2,
  },
  youBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A90D9',
    backgroundColor: '#EBF2FA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  endButton: {
    borderWidth: 1,
    borderColor: '#E74C3C',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginVertical: 20,
  },
  endButtonText: {
    color: '#E74C3C',
    fontSize: 16,
    fontWeight: '600',
  },
});
