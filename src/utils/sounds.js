import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

// Sound assets — replace these with real sound files for custom audio feedback.
// The placeholder files are silent; haptic feedback always fires regardless.
const SEND_SOUND = require('../../assets/sounds/send.mp3');
const WATER_SOUND = require('../../assets/sounds/water.mp3');
const SHOT_SOUND = require('../../assets/sounds/shot.mp3');

let sendSound = null;
let receiveWaterSound = null;
let receiveShotSound = null;

export async function loadSounds() {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
    });

    const { sound: send } = await Audio.Sound.createAsync(SEND_SOUND, { shouldPlay: false });
    sendSound = send;

    const { sound: water } = await Audio.Sound.createAsync(WATER_SOUND, { shouldPlay: false });
    receiveWaterSound = water;

    const { sound: shot } = await Audio.Sound.createAsync(SHOT_SOUND, { shouldPlay: false });
    receiveShotSound = shot;
  } catch (e) {
    // Sounds are optional — app works with haptics alone
    console.warn('Could not load sounds:', e);
  }
}

export async function unloadSounds() {
  try {
    if (sendSound) await sendSound.unloadAsync();
    if (receiveWaterSound) await receiveWaterSound.unloadAsync();
    if (receiveShotSound) await receiveShotSound.unloadAsync();
  } catch (e) {
    // Ignore unload errors
  }
}

async function playSound(sound) {
  try {
    if (!sound) return;
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (e) {
    // Non-critical
  }
}

export async function playSendSound() {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  await playSound(sendSound);
}

export async function playReceiveSound(drinkType) {
  if (drinkType === 'shot') {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await playSound(receiveShotSound);
  } else {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await playSound(receiveWaterSound);
  }
}

export async function playAcceptHaptic() {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export async function playDeclineHaptic() {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
