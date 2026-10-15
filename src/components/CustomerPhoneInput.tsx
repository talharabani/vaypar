import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/use-theme';
import { COUNTRY_CODES, CountryCodeItem, detectCountryCode, validateCustomerPhone } from '../utils/phoneUtils';
import { useAuthStore } from '../store/useAuthStore';

interface CustomerPhoneInputProps {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  onCountryCodeChange?: (countryCode: string) => void;
  selectedCountryCode?: string;
  containerStyle?: StyleProp<ViewStyle>;
  error?: string;
  required?: boolean;
}

export function CustomerPhoneInput({
  label = 'Customer Phone',
  value,
  onChangeText,
  onCountryCodeChange,
  selectedCountryCode,
  containerStyle,
  error: customError,
  required = false,
}: CustomerPhoneInputProps) {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);

  // Default to user's registered phone country code, or +92
  const defaultCode = selectedCountryCode || detectCountryCode(user?.phone);
  const [activeCode, setActiveCode] = useState(defaultCode);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (selectedCountryCode && selectedCountryCode !== activeCode) {
      setActiveCode(selectedCountryCode);
    }
  }, [selectedCountryCode]);

  const countryItem = COUNTRY_CODES.find((c) => c.code === activeCode) || COUNTRY_CODES[0];

  const handleSelectCountry = (country: CountryCodeItem) => {
    setActiveCode(country.code);
    setPickerOpen(false);
    if (onCountryCodeChange) {
      onCountryCodeChange(country.code);
    }
  };

  // Check validation
  const validation = value ? validateCustomerPhone(value, activeCode) : { isValid: true, error: undefined };
  const displayError = customError || (value && !validation.isValid ? validation.error : undefined);

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
          {user?.phone && (
            <Text style={[styles.registeredHint, { color: theme.textSecondary }]}>
              Registered ({detectCountryCode(user.phone)})
            </Text>
          )}
        </View>
      )}

      <View
        style={[
          styles.inputRow,
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
        {/* Country Code Trigger */}
        <TouchableOpacity
          style={[styles.countryBadge, { borderRightColor: theme.border }]}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.flagText}>{countryItem.flag}</Text>
          <Text style={[styles.codeText, { color: theme.text }]}>{countryItem.code}</Text>
          <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
        </TouchableOpacity>

        {/* Raw Phone Input */}
        <TextInput
          style={[
            styles.phoneInput,
            { color: theme.text },
            Platform.select({
              web: { outlineStyle: 'none' } as any,
              default: {},
            }),
          ]}
          value={value}
          onChangeText={(text) => {
            // Keep digits, spaces, hyphens
            const clean = text.replace(/[^0-9\s-]/g, '');
            onChangeText(clean);
          }}
          placeholder={countryItem.placeholder}
          placeholderTextColor={theme.textSecondary + '75'}
          keyboardType="phone-pad"
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

      {/* Country Selection Modal */}
      <Modal visible={pickerOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPickerOpen(false)}
        >
          <View
            style={[
              styles.pickerContainer,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          >
            <View style={[styles.pickerHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.pickerTitle, { color: theme.text }]}>Select Country Code</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={COUNTRY_CODES}
              keyExtractor={(item) => item.code + item.name}
              renderItem={({ item }) => {
                const isSelected = item.code === activeCode;
                return (
                  <TouchableOpacity
                    style={[
                      styles.countryRow,
                      isSelected && { backgroundColor: theme.primary + '15' },
                    ]}
                    onPress={() => handleSelectCountry(item)}
                  >
                    <Text style={styles.rowFlag}>{item.flag}</Text>
                    <View style={styles.rowInfo}>
                      <Text
                        style={[
                          styles.rowName,
                          { color: isSelected ? theme.primary : theme.text },
                        ]}
                      >
                        {item.name}
                      </Text>
                      <Text style={[styles.rowExample, { color: theme.textSecondary }]}>
                        {item.placeholder}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.rowCode,
                        { color: isSelected ? theme.primary : theme.textSecondary },
                      ]}
                    >
                      {item.code}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={theme.primary}
                        style={{ marginLeft: 8 }}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
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
  registeredHint: {
    fontSize: 11,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    height: 44,
    overflow: 'hidden',
  },
  countryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: '100%',
    borderRightWidth: 1,
    gap: 4,
  },
  flagText: {
    fontSize: 16,
  },
  codeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 10,
    height: '100%',
  },
  clearBtn: {
    paddingRight: 10,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerContainer: {
    width: '100%',
    maxWidth: 420,
    maxHeight: 480,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.1)',
  },
  rowFlag: {
    fontSize: 22,
    marginRight: 12,
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowExample: {
    fontSize: 12,
    marginTop: 2,
  },
  rowCode: {
    fontSize: 13,
    fontWeight: '700',
  },
});
