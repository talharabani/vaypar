import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/use-theme';
import { sanitizeCustomerName, validateCustomerName } from '../utils/phoneUtils';

interface CustomerNameInputProps {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  containerStyle?: StyleProp<ViewStyle>;
  error?: string;
  required?: boolean;
}

export function CustomerNameInput({
  label = 'Customer Name',
  value,
  onChangeText,
  placeholder = 'e.g. Ahmed Ali / John Doe',
  containerStyle,
  error: customError,
  required = false,
}: CustomerNameInputProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [numWarning, setNumWarning] = useState(false);

  const handleChangeText = (text: string) => {
    if (/[0-9]/.test(text)) {
      setNumWarning(true);
      setTimeout(() => setNumWarning(false), 3000);
    }
    const clean = sanitizeCustomerName(text);
    onChangeText(clean);
  };

  const validation = value ? validateCustomerName(value) : { isValid: true, error: undefined };
  const displayError = customError || (numWarning ? 'Numbers are not allowed in customer name.' : (value && !validation.isValid ? validation.error : undefined));

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <View style={styles.labelRow}>
          <Text
            style={[
              styles.label,
              {
                color: displayError
                  ? theme.danger
                  : isFocused
                  ? theme.primary
                  : theme.textSecondary,
              },
            ]}
          >
            {label}
            {required && <Text style={{ color: theme.danger }}> *</Text>}
          </Text>
        </View>
      )}

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.background,
            borderColor: displayError
              ? theme.danger
              : isFocused
              ? theme.primary
              : theme.border,
          },
        ]}
      >
        <Ionicons
          name="person-outline"
          size={16}
          color={isFocused ? theme.primary : theme.textSecondary}
          style={{ marginRight: 8 }}
        />
        <TextInput
          style={[
            styles.input,
            { color: theme.text },
            Platform.select({
              web: { outlineStyle: 'none' } as any,
              default: {},
            }),
          ]}
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary + '75'}
          autoCapitalize="words"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />

        {value.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => onChangeText('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {displayError && (
        <Text style={[styles.errorText, { color: theme.danger }]}>
          {displayError}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  clearBtn: {
    padding: 2,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
    fontWeight: '500',
  },
});
