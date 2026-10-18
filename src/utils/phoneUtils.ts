export interface CountryCodeItem {
  code: string;
  flag: string;
  name: string;
  placeholder: string;
  digitsLength?: number[];
  regex: RegExp;
}

export const COUNTRY_CODES: CountryCodeItem[] = [
  { 
    code: '+92', 
    flag: '🇵🇰', 
    name: 'Pakistan', 
    placeholder: '300 1234567',
    digitsLength: [10, 11],
    regex: /^(\+92|0)?3[0-9]{9}$/ 
  },
  { 
    code: '+1', 
    flag: '🇺🇸', 
    name: 'USA / Canada', 
    placeholder: '(555) 234-5678',
    digitsLength: [10],
    regex: /^(\+1)?[2-9][0-9]{9}$/ 
  },
  { 
    code: '+44', 
    flag: '🇬🇧', 
    name: 'UK', 
    placeholder: '7911 123456',
    digitsLength: [10, 11],
    regex: /^(\+44|0)?7[0-9]{9}$/ 
  },
  { 
    code: '+971', 
    flag: '🇦🇪', 
    name: 'UAE', 
    placeholder: '50 123 4567',
    digitsLength: [9],
    regex: /^(\+971|0)?5[0-9]{8}$/ 
  },
  { 
    code: '+966', 
    flag: '🇸🇦', 
    name: 'Saudi Arabia', 
    placeholder: '50 123 4567',
    digitsLength: [9],
    regex: /^(\+966|0)?5[0-9]{8}$/ 
  },
  { 
    code: '+91', 
    flag: '🇮🇳', 
    name: 'India', 
    placeholder: '98765 43210',
    digitsLength: [10],
    regex: /^(\+91|0)?[6-9][0-9]{9}$/ 
  },
  { 
    code: '+49', 
    flag: '🇩🇪', 
    name: 'Germany', 
    placeholder: '151 23456789',
    digitsLength: [10, 11, 12],
    regex: /^(\+49|0)?[1-9][0-9]{8,11}$/ 
  },
  { 
    code: '+61', 
    flag: '🇦🇺', 
    name: 'Australia', 
    placeholder: '412 345 678',
    digitsLength: [9, 10],
    regex: /^(\+61|0)?4[0-9]{8}$/ 
  },
  { 
    code: '+', 
    flag: '🌐', 
    name: 'International', 
    placeholder: 'Phone with country code',
    regex: /^\+?[0-9]{7,15}$/ 
  },
];

/**
 * Detects country code prefix from a saved/registered phone number string.
 */
export function detectCountryCode(phone?: string | null): string {
  if (!phone) return '+92';
  const trimmed = phone.trim();
  for (const c of COUNTRY_CODES) {
    if (c.code !== '+' && trimmed.startsWith(c.code)) {
      return c.code;
    }
  }
  return '+92';
}

/**
 * Strips numeric digits and disallowed characters from name inputs.
 * Ensures the name only contains valid alphabetic letters and acceptable name punctuation.
 */
export function sanitizeCustomerName(text: string): string {
  // Allow letters, numbers, spaces, hyphens, periods, hashes, parentheses, apostrophes, and Urdu/Arabic
  return text.replace(/[^\w\s.'\-#()/,\u0600-\u06FF]/gi, '');
}

/**
 * Validates a customer name:
 * - Must not be empty
 * - Must have at least 2 characters
 */
export function validateCustomerName(name: string): { isValid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Customer name is required.' };
  }
  if (trimmed.length < 2) {
    return { isValid: false, error: 'Name must have at least 2 characters.' };
  }
  return { isValid: true };
}

/**
 * Validates phone number against the country code rules.
 */
export function validateCustomerPhone(phone: string, countryCode: string = '+92'): { isValid: boolean; error?: string; fullPhone: string } {
  const trimmed = phone.trim();
  if (!trimmed) {
    return { isValid: true, fullPhone: '' }; // Optional
  }

  // Remove spaces, hyphens, parentheses
  const cleanDigits = trimmed.replace(/[\s\-()]/g, '');
  
  // If already starts with '+', validate global regex
  if (cleanDigits.startsWith('+')) {
    if (!/^\+[0-9]{7,15}$/.test(cleanDigits)) {
      return { isValid: false, error: 'Invalid international phone number.', fullPhone: cleanDigits };
    }
    return { isValid: true, fullPhone: cleanDigits };
  }

  const country = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];
  
  if (countryCode === '+92') {
    // Pakistan: 03001234567 or 3001234567
    const normalized = cleanDigits.startsWith('0') ? cleanDigits.substring(1) : cleanDigits;
    if (!/^3[0-9]{9}$/.test(normalized)) {
      return { 
        isValid: false, 
        error: 'Invalid Pakistan phone (format: 03XX-XXXXXXX or 3XX-XXXXXXX, 10-11 digits).', 
        fullPhone: `+92${normalized}` 
      };
    }
    return { isValid: true, fullPhone: `+92${normalized}` };
  }

  if (countryCode === '+1') {
    // USA/Canada: 10 digits
    const normalized = cleanDigits.startsWith('1') && cleanDigits.length === 11 ? cleanDigits.substring(1) : cleanDigits;
    if (!/^[2-9][0-9]{9}$/.test(normalized)) {
      return { 
        isValid: false, 
        error: 'Invalid US/Canada phone (10 digits required).', 
        fullPhone: `+1${normalized}` 
      };
    }
    return { isValid: true, fullPhone: `+1${normalized}` };
  }

  if (countryCode === '+971' || countryCode === '+966') {
    const normalized = cleanDigits.startsWith('0') ? cleanDigits.substring(1) : cleanDigits;
    if (!/^5[0-9]{8}$/.test(normalized)) {
      return { 
        isValid: false, 
        error: `Invalid ${country.name} phone (format: 5X XXX XXXX, 9 digits).`, 
        fullPhone: `${countryCode}${normalized}` 
      };
    }
    return { isValid: true, fullPhone: `${countryCode}${normalized}` };
  }

  if (countryCode === '+91') {
    const normalized = cleanDigits.startsWith('0') ? cleanDigits.substring(1) : cleanDigits;
    if (!/^[6-9][0-9]{9}$/.test(normalized)) {
      return { 
        isValid: false, 
        error: 'Invalid India phone (10 digits starting with 6-9).', 
        fullPhone: `+91${normalized}` 
      };
    }
    return { isValid: true, fullPhone: `+91${normalized}` };
  }

  // Generic fallback validation
  const digitsOnly = cleanDigits.replace(/\D/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    return { 
      isValid: false, 
      error: 'Phone number must be between 7 and 15 digits.', 
      fullPhone: `${countryCode}${digitsOnly}` 
    };
  }

  return { isValid: true, fullPhone: `${countryCode}${digitsOnly}` };
}
