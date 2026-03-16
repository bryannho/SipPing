import React, { useState, useCallback } from 'react';
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
  Switch,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { pickAndUploadAvatar } from '../utils/imageUpload';
import { colors, fonts, radii, shadows, spacing, typography } from '../theme';

export function MeScreen({ navigation }) {
  const { user, signOut, updateProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [trips, setTrips] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('name, avatar_url')
      .eq('id', user.id)
      .single();
    if (data) {
      setProfile(data);
      setNewName(data.name);
    }
  }, [user.id]);

  const fetchTrips = useCallback(async () => {
    const { data } = await supabase
      .from('trip_members')
      .select('trip_id, trips(id, name, status, invite_code, start_date, end_date)')
      .eq('user_id', user.id);

    const allTrips = (data || [])
      .map((tm) => tm.trips)
      .filter(Boolean)
      .sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return 0;
      });

    setTrips(allTrips);
  }, [user.id]);

  const fetchSchedules = useCallback(async () => {
    const { data } = await supabase
      .from('scheduled_rules')
      .select(
        '*, recipient:users!scheduled_rules_to_user_id_fkey(name, email), sender:users!scheduled_rules_from_user_id_fkey(name, email), trip:trips(name)'
      )
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(10);

    setSchedules(data || []);
  }, [user.id]);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
      fetchTrips();
      fetchSchedules();
    }, [fetchProfile, fetchTrips, fetchSchedules])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchProfile(), fetchTrips(), fetchSchedules()]);
    setRefreshing(false);
  };

  const handleChangeAvatar = async () => {
    setSavingAvatar(true);
    const publicUrl = await pickAndUploadAvatar(user.id);
    if (publicUrl) {
      setProfile((prev) => ({ ...prev, avatar_url: publicUrl }));
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

  const toggleSchedule = async (rule) => {
    const newActive = !rule.active;
    const { error } = await supabase
      .from('scheduled_rules')
      .update({ active: newActive })
      .eq('id', rule.id);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setSchedules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, active: newActive } : r))
    );
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
      'This is permanent and cannot be undone.',
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
      const { data: photos } = await supabase.storage
        .from('drink-photos')
        .list(user.id);
      if (photos?.length > 0) {
        const filePaths = photos.map((f) => `${user.id}/${f.name}`);
        await supabase.storage.from('drink-photos').remove(filePaths);
      }

      const { data: avatarFiles } = await supabase.storage
        .from('avatars')
        .list(user.id);
      if (avatarFiles?.length > 0) {
        const avatarPaths = avatarFiles.map((f) => `${user.id}/${f.name}`);
        await supabase.storage.from('avatars').remove(avatarPaths);
      }

      await supabase.from('drink_log').delete().eq('user_id', user.id);
      await supabase.from('drink_pings').delete().eq('from_user_id', user.id);
      await supabase.from('drink_pings').delete().eq('to_user_id', user.id);
      await supabase.from('scheduled_rules').delete().eq('from_user_id', user.id);
      await supabase.from('scheduled_rules').delete().eq('to_user_id', user.id);
      await supabase.from('trip_members').delete().eq('user_id', user.id);

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

      await supabase.from('users').delete().eq('id', user.id);
      await signOut();
    } catch (e) {
      console.warn('Account deletion error:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setDeleting(false);
    }
  };

  const formatInterval = (minutes) => {
    if (minutes < 60) return `Every ${minutes}m`;
    const hrs = minutes / 60;
    if (hrs === 1) return 'Every hour';
    return `Every ${hrs}h`;
  };

  const userName = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || '';
  const userEmail = user?.email || '';
  const avatarUrl = profile?.avatar_url || null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Title */}
      <Text style={styles.screenTitle}>Me</Text>

      {/* Profile */}
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
                <ActivityIndicator size="small" color={colors.cta} />
              ) : (
                <Ionicons name="checkmark-circle" size={28} color={colors.cta} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setNewName(userName);
                setEditingName(false);
              }}
            >
              <Ionicons name="close-circle" size={28} color={colors.textTertiary} />
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
            <Ionicons name="pencil" size={16} color={colors.textTertiary} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        )}
        <Text style={styles.userEmail}>{userEmail}</Text>
      </View>

      {/* Your Trips */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Trips</Text>
          <View style={styles.sectionActions}>
            <TouchableOpacity
              style={styles.smallButton}
              onPress={() => navigation.navigate('CreateTrip')}
            >
              <Ionicons name="add" size={16} color={colors.cta} />
              <Text style={styles.smallButtonText}>New</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.smallButton}
              onPress={() => navigation.navigate('JoinTrip')}
            >
              <Ionicons name="enter-outline" size={16} color={colors.cta} />
              <Text style={styles.smallButtonText}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>

        {trips.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>No trips yet. Create or join one!</Text>
          </View>
        ) : (
          trips.map((trip) => (
            <TouchableOpacity
              key={trip.id}
              style={styles.tripRow}
              onPress={() =>
                navigation.navigate('TripDetail', {
                  tripId: trip.id,
                  tripName: trip.name,
                  inviteCode: trip.invite_code,
                })
              }
            >
              <View style={styles.tripRowLeft}>
                <Text style={styles.tripRowName} numberOfLines={1}>
                  {trip.name}
                </Text>
                {trip.start_date && (
                  <Text style={styles.tripRowDate}>
                    {trip.end_date
                      ? `${trip.start_date} – ${trip.end_date}`
                      : `Started ${trip.start_date}`}
                  </Text>
                )}
              </View>
              <View
                style={[
                  styles.statusBadge,
                  trip.status === 'active'
                    ? styles.statusBadgeActive
                    : styles.statusBadgeDone,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    trip.status === 'active'
                      ? styles.statusBadgeTextActive
                      : styles.statusBadgeTextDone,
                  ]}
                >
                  {trip.status === 'active' ? 'Active' : 'Done'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Schedules */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Schedules</Text>
          <TouchableOpacity
            style={styles.smallButton}
            onPress={() => {
              const activeTrip = trips.find((t) => t.status === 'active');
              if (activeTrip) {
                navigation.navigate('ScheduleRules', { tripId: activeTrip.id });
              } else {
                Alert.alert('No active trip', 'Create or join a trip first.');
              }
            }}
          >
            <Text style={styles.smallButtonText}>Manage</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.cta} />
          </TouchableOpacity>
        </View>

        {schedules.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>No scheduled pings yet.</Text>
          </View>
        ) : (
          schedules.slice(0, 5).map((rule) => {
            const isSender = rule.from_user_id === user.id;
            const otherName = isSender
              ? rule.recipient?.name || rule.recipient?.email || 'Unknown'
              : rule.sender?.name || rule.sender?.email || 'Unknown';
            const emoji = rule.type === 'water' ? '💧' : '🥃';

            return (
              <View key={rule.id} style={styles.scheduleRow}>
                <Text style={styles.scheduleEmoji}>{emoji}</Text>
                <View style={styles.scheduleInfo}>
                  <Text style={styles.scheduleName} numberOfLines={1}>
                    {isSender ? `→ ${otherName}` : `← ${otherName}`}
                  </Text>
                  <Text style={styles.scheduleDetail}>
                    {formatInterval(rule.interval_minutes)} · {rule.trip?.name || ''}
                  </Text>
                </View>
                <Switch
                  value={rule.active}
                  onValueChange={() => toggleSchedule(rule)}
                  trackColor={{ false: '#D1D5DB', true: 'rgba(255, 107, 107, 0.3)' }}
                  thumbColor={rule.active ? colors.cta : '#f4f3f4'}
                />
              </View>
            );
          })
        )}
      </View>

      {/* Account */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: spacing.md }]}>Account</Text>

        <TouchableOpacity style={styles.accountRow} onPress={signOut}>
          <Ionicons name="log-out-outline" size={22} color={colors.navy} />
          <Text style={styles.accountRowText}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={styles.deleteButtonText}>Delete Account</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.dangerNote}>
          This will permanently remove all your data.
        </Text>
      </View>
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
    paddingTop: 60,
    paddingBottom: 60,
  },
  screenTitle: {
    ...typography.h1,
    marginBottom: spacing.lg,
  },
  // Profile
  profileSection: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.lavender,
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
    fontFamily: fonts.heading,
    fontSize: 32,
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
    backgroundColor: colors.cta,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  nameInput: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.navy,
    borderBottomWidth: 2,
    borderBottomColor: colors.cta,
    paddingVertical: spacing.xs,
    minWidth: 120,
    textAlign: 'center',
  },
  userName: {
    ...typography.h2,
  },
  userEmail: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  // Sections
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
  },
  sectionActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  smallButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.cta,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.card,
  },
  emptyCardText: {
    ...typography.caption,
  },
  // Trips
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  tripRowLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  tripRowName: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.navy,
  },
  tripRowDate: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginRight: spacing.sm,
  },
  statusBadgeActive: {
    backgroundColor: 'rgba(76, 175, 125, 0.12)',
  },
  statusBadgeDone: {
    backgroundColor: 'rgba(160, 173, 184, 0.12)',
  },
  statusBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
  },
  statusBadgeTextActive: {
    color: colors.success,
  },
  statusBadgeTextDone: {
    color: colors.textSecondary,
  },
  // Schedules
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  scheduleEmoji: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  scheduleInfo: {
    flex: 1,
  },
  scheduleName: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.navy,
  },
  scheduleDetail: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 2,
  },
  // Account
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
    ...shadows.card,
  },
  accountRowText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.navy,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  deleteButtonText: {
    color: '#fff',
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
  dangerNote: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
});
