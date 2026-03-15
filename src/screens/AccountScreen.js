import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { pickAndUploadAvatar } from '../utils/imageUpload';
import { useFocusEffect } from '@react-navigation/native';

export function AccountScreen({ navigation }) {
  const { user, signOut, updateProfile } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [profile, setProfile] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  // Fetch profile from public.users on screen focus
  useFocusEffect(
    useCallback(() => {
      async function fetchProfile() {
        const { data } = await supabase
          .from('users')
          .select('name, avatar_url')
          .eq('id', user.id)
          .single();
        if (data) {
          setProfile(data);
          setNewName(data.name);
        }
      }
      fetchProfile();
    }, [user.id])
  );

  const handleChangeAvatar = async () => {
    setSavingAvatar(true);
    const publicUrl = await pickAndUploadAvatar(user.id);
    if (publicUrl) {
      setProfile((prev) => ({ ...prev, avatar_url: publicUrl }));
      // Sync auth metadata
      await updateProfile({ avatar_url: publicUrl });
    }
    setSavingAvatar(false);
  };

  const handleSaveName = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Display name cannot be empty.');
      return;
    }
    setSavingName(true);
    const { error } = await updateProfile({ name: trimmed });
    setSavingName(false);
    if (error) {
      Alert.alert('Error', 'Could not update name. Please try again.');
    } else {
      setProfile((prev) => ({ ...prev, name: trimmed }));
      setEditingName(false);
    }
  };

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

      // Delete avatar from storage
      const { data: avatarFiles } = await supabase.storage
        .from('avatars')
        .list(user.id);

      if (avatarFiles?.length > 0) {
        const avatarPaths = avatarFiles.map((f) => `${user.id}/${f.name}`);
        await supabase.storage.from('avatars').remove(avatarPaths);
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

  const userName = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || '';
  const userEmail = user?.email || '';
  const avatarUrl = profile?.avatar_url || null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile section */}
      <View style={styles.profileSection}>
        <TouchableOpacity onPress={handleChangeAvatar} disabled={savingAvatar}>
          <View style={styles.avatarContainer}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(userName || userEmail || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            {savingAvatar ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : (
              <View style={styles.cameraIcon}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            )}
          </View>
        </TouchableOpacity>

        {editingName ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={styles.nameInput}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <TouchableOpacity onPress={handleSaveName} disabled={savingName}>
              {savingName ? (
                <ActivityIndicator size="small" color="#4A90D9" />
              ) : (
                <Ionicons name="checkmark-circle" size={28} color="#4A90D9" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setNewName(userName);
                setEditingName(false);
              }}
            >
              <Ionicons name="close-circle" size={28} color="#ccc" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.nameRow}
            onPress={() => {
              setNewName(userName);
              setEditingName(true);
            }}
          >
            <Text style={styles.userName}>{userName}</Text>
            <Ionicons name="pencil" size={16} color="#aaa" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        )}
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
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4A90D9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4A90D9',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  nameInput: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    borderBottomWidth: 2,
    borderBottomColor: '#4A90D9',
    paddingVertical: 4,
    minWidth: 120,
    textAlign: 'center',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  userEmail: {
    fontSize: 15,
    color: '#888',
    marginTop: 4,
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
