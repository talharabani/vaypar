import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
    Alert,
    Image,
    Platform,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useTheme } from '../hooks/use-theme';

interface LogoUploaderProps {
  value?: string;
  onChange: (uri: string) => void;
  /** First letter fallback when no logo set */
  initials?: string;
  /** Circle diameter in px (default 80) */
  size?: number;
  /** Label shown below preview — pass undefined to hide */
  label?: string;
}

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return true; // web doesn't need permissions
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Permission Required',
      'Please allow access to your photo library to upload a logo.',
    );
    return false;
  }
  return true;
}

export function LogoUploader({
  value,
  onChange,
  initials = 'V',
  size = 80,
  label,
}: LogoUploaderProps) {
  const theme = useTheme();
  const [picking, setPicking] = useState(false);

  const handlePick = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const granted = await requestPermissions();
      if (!granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: false,
      });

      if (!result.canceled && result.assets.length > 0) {
        onChange(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err.message || 'Could not open image library.');
    } finally {
      setPicking(false);
    }
  };

  const handleRemove = () => {
    Alert.alert('Remove Logo', 'Are you sure you want to remove the logo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onChange('') },
    ]);
  };

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      {/* Preview circle */}
      <TouchableOpacity
        onPress={handlePick}
        activeOpacity={0.8}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          borderWidth: 2,
          borderColor: value ? theme.primary : theme.border,
          backgroundColor: theme.backgroundElement,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
        }}
      >
        {value ? (
          <Image
            source={{ uri: value }}
            style={{ width: size, height: size }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: size,
              height: size,
              backgroundColor: theme.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: '#FFF',
                fontSize: size * 0.38,
                fontWeight: '900',
              }}
            >
              {initials}
            </Text>
          </View>
        )}

        {/* camera overlay badge */}
        {picking ? null : (
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: size * 0.32,
              height: size * 0.32,
              borderRadius: (size * 0.32) / 2,
              backgroundColor: theme.primary,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: theme.background,
            }}
          >
            <Ionicons name="camera" size={size * 0.16} color="#FFF" />
          </View>
        )}
      </TouchableOpacity>

      {/* Label */}
      {label !== undefined && (
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: theme.textSecondary,
            textAlign: 'center',
          }}
        >
          {label ?? (value ? 'Tap to change logo' : 'Initials Avatar (Auto Generated)')}
        </Text>
      )}

      {/* Upload / Remove buttons row */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          onPress={handlePick}
          disabled={picking}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: theme.primary,
            backgroundColor: theme.backgroundElement,
            opacity: picking ? 0.6 : 1,
          }}
        >
          <Ionicons name="cloud-upload-outline" size={16} color={theme.primary} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>
            {value ? 'Change Logo' : 'Upload Logo'}
          </Text>
        </TouchableOpacity>

        {value ? (
          <TouchableOpacity
            onPress={handleRemove}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.danger,
              backgroundColor: theme.backgroundElement,
            }}
          >
            <Ionicons name="trash-outline" size={16} color={theme.danger} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.danger }}>
              Remove
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
