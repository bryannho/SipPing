import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';

const MAX_WIDTH = 800;
const JPEG_QUALITY = 0.7;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Launch camera or photo library, compress, and upload to Supabase Storage.
 * Returns the public URL or null if cancelled/failed.
 */
export async function pickAndUploadDrinkPhoto(userId, tripId, pingId) {
  const choice = await new Promise((resolve) => {
    Alert.alert(
      'Add a Photo',
      'Show off your drink!',
      [
        { text: 'Skip', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Take Photo', onPress: () => resolve('camera') },
        { text: 'Choose from Library', onPress: () => resolve('library') },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });

  if (!choice) return null;

  let result;

  if (choice === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take photos.');
      return null;
    }
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return null;
    }
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
  }

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];

  try {
    // Compress image
    const compressed = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: MAX_WIDTH } }],
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );

    // Read the file as ArrayBuffer (fetch().blob() is unreliable in React Native)
    const arrayBuffer = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', compressed.uri, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => resolve(xhr.response);
      xhr.onerror = () => reject(new Error('Failed to read file'));
      xhr.send();
    });

    if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
      Alert.alert('File too large', 'Please choose a smaller photo (max 2MB).');
      return null;
    }

    // Upload to Supabase Storage
    const fileName = `${userId}/${tripId}/${pingId}_${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('drink-photos')
      .upload(fileName, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.warn('Upload error:', uploadError);
      Alert.alert('Upload failed', 'Could not upload photo. The drink was still logged.');
      return null;
    }

    // Return the storage path (not a URL) — signed URLs are generated at display time
    return fileName;
  } catch (e) {
    console.warn('Image processing error:', e);
    return null;
  }
}
