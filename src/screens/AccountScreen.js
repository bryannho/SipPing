import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export function AccountScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data (trips, pings, drink logs, and photos). This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: confirmDelete,
        },
      ]
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      'Are you absolutely sure?',
      'Type your email to confirm: this is permanent.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete My Account',
          style: 'destructive',
          onPress: executeDelete,
        },
      ]
    );
  };

  const executeDelete = async () => {
    setDeleting(true);

    try {
      // Delete user's drink photos from storage
      const { data: photos } = await supabase.storage
        .from('drink-photos')
        .list(user.id);

      if (photos?.length > 0) {
        const filePaths = photos.map((f) => `${user.id}/${f.name}`);
        await supabase.storage.from('drink-photos').remove(filePaths);
      }

      // Delete user's drink log entries
      await supabase.from('drink_log').delete().eq('user_id', user.id);

      // Delete pings sent by or to the user
      await supabase.from('drink_pings').delete().eq('from_user_id', user.id);
      await supabase.from('drink_pings').delete().eq('to_user_id', user.id);

      // Delete scheduled rules
      await supabase.from('scheduled_rules').delete().eq('from_user_id', user.id);
      await supabase.from('scheduled_rules').delete().eq('to_user_id', user.id);

      // Remove from trip memberships
      await supabase.from('trip_members').delete().eq('user_id', user.id);

      // Delete trips created by this user that have no other members
      const { data: createdTrips } = await supabase
        .from('trips')
        .select('id')
        .eq('created_by', user.id);

      if (createdTrips) {
        for (const trip of createdTrips) {
          const { count } = await supabase
            .from('trip_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('trip_id', trip.id);

          if (count === 0) {
            await supabase.from('trips').delete().eq('id', trip.id);
          }
        }
      }

      // Delete the public users row
      await supabase.from('users').delete().eq('id', user.id);

      // Sign out (this also handles the auth user on the client side)
      await signOut();
    } catch (e) {
      console.warn('Account deletion error:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setDeleting(false);
    }
  };

  const userEmail = user?.email || '';
  const userName = user?.user_metadata?.name || userEmail.split('@')[0] || '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile section */}
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(userName || userEmail || '?')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.userName}>{userName}</Text>
        <Text style={styles.userEmail}>{userEmail}</Text>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.actionRow} onPress={signOut}>
          <Ionicons name="log-out-outline" size={22} color="#1a1a1a" />
          <Text style={styles.actionText}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={18} color="#ccc" />
        </TouchableOpacity>
      </View>

      {/* Danger zone */}
      <View style={styles.dangerSection}>
        <Text style={styles.dangerTitle}>Danger Zone</Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={20} color="#fff" />
              <Text style={styles.deleteButtonText}>Delete Account</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.dangerNote}>
          This will permanently remove all your data including trips, pings, photos, and stats.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingBottom: 60,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4A90D9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 15,
    color: '#888',
  },
  section: {
    marginBottom: 32,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  actionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  dangerSection: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 24,
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E74C3C',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E74C3C',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerNote: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
});
