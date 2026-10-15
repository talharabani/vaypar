import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    Platform,
    StyleProp,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    TouchableOpacity,
    View,
    ViewStyle
} from 'react-native';
import { useTheme } from '../hooks/use-theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  secureTextEntry?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Input({ 
  label, 
  error, 
  secureTextEntry = false, 
  style, 
  containerStyle,
  onBlur, 
  onFocus, 
  ...rest 
}: InputProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  const showPasswordToggle = secureTextEntry;
  const isSecure = secureTextEntry && !isPasswordVisible;

  const isDark = theme.cardShadow === '#0F0E0D';
  const shadowDark = theme.cardShadow;
  const shadowLight = isDark ? '#23201E' : '#FFFFFF';

  const getWebShadow = () => {
    if (error) return `0 0 0 3px ${theme.danger}30`;
    if (isFocused) return `0 0 0 3px ${theme.primary}30`;
    return 'none';
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text 
          style={[
            styles.label, 
            { 
              color: error 
                ? theme.danger 
                : isFocused 
                  ? theme.primary 
                  : theme.textSecondary 
            }
          ]}
        >
          {label}
        </Text>
      )}
      <View 
        style={[
          styles.inputContainer,
          { 
            backgroundColor: theme.background,
            borderColor: error 
              ? theme.danger 
              : isFocused 
                ? theme.primary 
                : theme.border,
            borderWidth: 1,
            borderRadius: 8,
          },
          Platform.select({
            web: {
              boxShadow: getWebShadow(),
              transition: 'all 0.15s ease',
            } as any,
            default: {}
          })
        ]}
      >
        <TextInput
          style={[
            styles.input,
            { color: theme.text },
            style
          ]}
          placeholderTextColor={theme.textSecondary + '75'}
          secureTextEntry={isSecure}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        />
        {showPasswordToggle && (
          <TouchableOpacity 
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            style={styles.iconContainer}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'} 
              size={20} 
              color={isFocused ? theme.primary : theme.textSecondary} 
            />
          </TouchableOpacity>
        )}
      </View>
      {error && (
        <Text style={[styles.error, { color: theme.danger }]}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginLeft: 6,
    letterSpacing: 0.2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 15,
    height: '100%',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any,
      default: {}
    })
  },
  iconContainer: {
    padding: 4,
  },
  error: {
    fontSize: 12,
    marginTop: 5,
    marginLeft: 6,
    fontWeight: '600',
  },
});
