import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function registerPushToken(userId) {
  if (!Device.isDevice) {
    console.warn('Push notifications only work on physical devices');
    return { granted: false };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return { granted: false };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  await supabase
    .from('users')
    .update({ expo_push_token: token.data })
    .eq('id', userId);

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  return { granted: true, token: token.data };
}

export function setupNotificationListeners() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function setupNotificationCategories() {
  await Notifications.setNotificationCategoryAsync('drink_ping', [
    {
      identifier: 'ACCEPT',
      buttonTitle: 'Accept',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'DECLINE',
      buttonTitle: 'Decline',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'LATER',
      buttonTitle: 'Later',
      options: { opensAppToForeground: false },
    },
  ]);
}

export async function sendDrinkPingNotification(
  recipientPushToken,
  senderName,
  drinkType,
  pingId,
  senderNote
) {
  const emoji = drinkType === 'water' ? '\u{1F4A7}' : '\u{1F943}';
  const drinkLabel = drinkType === 'water' ? 'water' : 'a shot';
  const body = senderNote
    ? `${senderName}: ${senderNote}`
    : `${senderName} wants you to drink ${drinkLabel}!`;

  try {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: recipientPushToken,
        sound: 'default',
        title: `${emoji} Drink Ping!`,
        body,
        data: { type: 'drink_ping', drinkType, pingId },
        categoryId: 'drink_ping',
      }),
    });
  } catch (e) {
    console.warn('Failed to send push notification:', e);
  }
}

export async function handleNotificationAction(actionIdentifier, data) {
  if (data?.type !== 'drink_ping' || !data.pingId) return;

  const pingId = data.pingId;

  switch (actionIdentifier) {
    case 'ACCEPT': {
      const { data: ping } = await supabase
        .from('drink_pings')
        .select('trip_id, to_user_id, type')
        .eq('id', pingId)
        .single();

      if (ping) {
        await supabase
          .from('drink_pings')
          .update({
            status: 'accepted',
            responded_at: new Date().toISOString(),
          })
          .eq('id', pingId);

        await supabase.from('drink_log').insert({
          trip_id: ping.trip_id,
          user_id: ping.to_user_id,
          type: ping.type,
          ping_id: pingId,
        });
      }
      break;
    }
    case 'DECLINE': {
      await supabase
        .from('drink_pings')
        .update({
          status: 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', pingId);
      break;
    }
    case 'LATER': {
      const snoozedUntil = new Date(
        Date.now() + 15 * 60 * 1000
      ).toISOString();
      const { data: ping } = await supabase
        .from('drink_pings')
        .select('snooze_count')
        .eq('id', pingId)
        .single();

      await supabase
        .from('drink_pings')
        .update({
          status: 'snoozed',
          snoozed_until: snoozedUntil,
          snooze_count: (ping?.snooze_count || 0) + 1,
        })
        .eq('id', pingId);
      break;
    }
  }
}
