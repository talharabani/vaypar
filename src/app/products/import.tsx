import React, { useState, useEffect, useMemo } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator,
  Platform,
  Switch
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useBusinessCategory } from '../../context/BusinessContext';
import { useImport, type ImportProgress } from '../../context/ImportContext';
import { useTheme } from '../../hooks/use-theme';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import ScreenWrapper from '../../components/ScreenWrapper';

import { 
  getColumnsForCategory, 
  getSampleTemplateData, 
  getDatabaseFieldsForCategory, 
  suggestColumnMappings, 
  validateImportRow, 
  parseCsvFile, 
  parseExcelFile,
  parseXmlFile,
  exportToCsv,
  exportToExcel,
  exportToXml,
  downloadExcelFile,
  downloadCsvFile,
  downloadXmlFile,
  getTemplateCsvRawText,
  getTemplateXmlRawText,
  type ValidationError
} from '../../services/importExportUtils';

import { 
  getImportHistory, 
  rollbackImport, 
  type ImportHistoryEntry 
} from '../../services/importHistoryDb';

export default function ImportExportScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const { products, refreshData } = useDatabase();
  const { categoryId } = useBusinessCategory();
  const { activeImport, startBackgroundImport, cancelActiveImport, clearActiveImport } = useImport();

  // Screen Tabs: 'import' | 'export' | 'history'
  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'history'>('import');

  // Step state: 1 (Choose File) | 2 (Preview) | 3 (Validate) | 4 (Mapping) | 5 (Progress) | 6 (Summary)
  const [step, setStep] = useState<number>(1);

  // Wizard Configuration
  const [duplicateHandling, setDuplicateHandling] = useState<'skip' | 'update' | 'duplicate'>('update');
  const [autoCreateCategories, setAutoCreateCategories] = useState<boolean>(true);
  const [skipInvalidRows, setSkipInvalidRows] = useState<boolean>(true);

  // Parse states
  const [file, setFile] = useState<{ name: string; content: any } | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrorList] = useState<ValidationError[]>([]);
  const [duplicateRowsCount, setDuplicateRowsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // History State
  const [historyList, setHistoryList] = useState<ImportHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  // Export State
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'xml'>('csv');
  const [exportFilters, setExportFilters] = useState({
    category: 'All',
    brand: 'All',
    supplier: 'All',
    status: 'All',
    startDate: '',
    endDate: ''
  });

  // Smart db fields
  const dbFields = useMemo(() => getDatabaseFieldsForCategory(categoryId), [categoryId]);

  // Load history log
  const loadHistory = async () => {
    if (!user?.businessId) return;
    setLoadingHistory(true);
    try {
      const logs = await getImportHistory(user.businessId);
      setHistoryList(logs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  // Download template helper
  const handleDownloadTemplate = (format: 'csv' | 'xlsx' | 'xml') => {
    const mockData = getSampleTemplateData(categoryId);
    const filename = `vaypar_${categoryId}_import_template.${format}`;

    if (Platform.OS === 'web') {
      if (format === 'csv') {
        downloadCsvFile(mockData, filename);
      } else if (format === 'xml') {
        downloadXmlFile(mockData, filename);
      } else {
        downloadExcelFile(mockData, filename, 'Import Template');
      }
    } else {
      Alert.alert(
        'Platform Note',
        'Templates are optimized for download on the Web browser client. Please use Vaypar Web.',
        [{ text: 'OK' }]
      );
    }
  };

  // Mock upload selector helper (to simulate file loading on all platforms/Expo Go)
  const handleSimulateMockUpload = (hasErrors = false) => {
    setIsLoading(true);
    setTimeout(() => {
      let mockRows: any[] = [];
      const cols = getColumnsForCategory(categoryId);

      if (categoryId === 'restaurant' || categoryId === 'cafe' || categoryId === 'dhaba' || categoryId === 'bakery' || categoryId === 'sweet_shop' || categoryId === 'juice_bar' || categoryId === 'coffee_shop') {
        mockRows = [
          { 'Item Name': 'Mutton Karahi', 'Category': 'Main Course', 'Price': 1500, 'Preparation Time': 25, 'Availability': 'Yes', 'Box Location': 'Kitchen-Rack-1' },
          { 'Item Name': 'Chicken Jalfrezi', 'Category': 'Main Course', 'Price': 950, 'Preparation Time': 20, 'Availability': 'Yes', 'Box Location': 'Kitchen-Rack-1' },
          { 'Item Name': 'Kheer', 'Category': 'Dessert', 'Price': hasErrors ? -120 : 120, 'Preparation Time': 5, 'Availability': 'Yes', 'Box Location': 'Fridge-Shelf-2' },
          { 'Item Name': '', 'Category': 'Appetizers', 'Price': 200, 'Preparation Time': 10, 'Availability': 'No', 'Box Location': 'Pantry-Box-3' }, // Missing Name error
        ];
      } else if (categoryId === 'pharmacy' || categoryId === 'medical_store') {
        mockRows = [
          { 'Medicine Name': 'Panadol Forte', 'Batch Number': 'B-PF404', 'Expiry Date': '2028-01-01', 'Manufacturer': 'GSK', 'Purchase Price': 10.0, 'Selling Price': 15.0, 'Box Location': 'Rack-A-Bin-4' },
          { 'Medicine Name': 'Disprin 300mg', 'Batch Number': 'B-DS999', 'Expiry Date': hasErrors ? '26/02/2026' : '2026-02-28', 'Manufacturer': 'Reckitt', 'Purchase Price': 2.0, 'Selling Price': 3.5, 'Box Location': 'Drawer-3' },
          { 'Medicine Name': 'Arinac Active', 'Batch Number': 'B-AR001', 'Expiry Date': '2027-10-31', 'Manufacturer': 'Abbott', 'Purchase Price': 4.5, 'Selling Price': hasErrors ? -6.0 : 6.0, 'Box Location': 'Rack-B-Bin-2' }
        ];
      } else if (categoryId === 'tailor') {
        mockRows = [
          { 'Fabric Name': 'Cotton Boski 80m', 'Color': 'Cream', 'Unit Price': 3500, 'Box Location': 'Shelf-1' },
          { 'Fabric Name': 'Khaddar Special Blend', 'Color': 'Slate Grey', 'Unit Price': hasErrors ? -1800 : 1800, 'Box Location': 'Shelf-2' }
        ];
      } else {
        // General product list
        mockRows = [
          { 'Product Name': 'Surf Excel 1kg', 'Category': 'Household', 'SKU': 'SURF-EX-1KG', 'Barcode': '8901030751912', 'Purchase Price': 390.0, 'Selling Price': 450.0, 'Quantity': 30, 'Unit': 'kg', 'Brand': 'Unilever', 'Supplier': 'Metro Distributors', 'Minimum Stock': 5, 'Tax': 0, 'Description': 'Detergent powder.', 'Image URL': '', 'Box Location': 'Box-A-102', 'Status': 'active' },
          { 'Product Name': 'Colgate MaxFresh 150g', 'Category': 'Personal Care', 'SKU': 'COLG-MF-150', 'Barcode': '8901030751913', 'Purchase Price': 180.0, 'Selling Price': hasErrors ? -220.0 : 220.0, 'Quantity': 15, 'Unit': 'pcs', 'Brand': 'Colgate-Palmolive', 'Supplier': 'Metro Distributors', 'Minimum Stock': 3, 'Tax': 0, 'Description': 'Toothpaste with cooling crystals.', 'Image URL': 'https://images.unsplash.com/photo-1559591937-e6b76a40ef3d', 'Box Location': 'Rack-3-Bin-1', 'Status': 'active' },
          { 'Product Name': '', 'Category': 'Household', 'SKU': 'MOCK-ERR', 'Barcode': '8901030751914', 'Purchase Price': 10, 'Selling Price': 20, 'Quantity': 5, 'Unit': 'pcs', 'Brand': 'Mock', 'Supplier': 'Mock', 'Minimum Stock': 1, 'Tax': 0, 'Description': 'Mock error row.', 'Image URL': '', 'Box Location': 'Box-Z-99', 'Status': 'active' }
        ];
      }

      setFile({ name: hasErrors ? 'simulation_with_errors.xlsx' : 'simulation_success.xlsx', content: null });
      setParsedRows(mockRows);
      setHeaders(cols);
      
      const suggested = suggestColumnMappings(cols, dbFields);
      setMappings(suggested);

      setIsLoading(false);
      setStep(2); // Move to Preview
    }, 800);
  };

  // HTML Web File Picker
  const handleWebFileSelect = async (e: any) => {
    const selected = e.target.files[0];
    if (!selected) return;

    setIsLoading(true);
    setFile({ name: selected.name, content: selected });

    try {
      const extension = selected.name.split('.').pop()?.toLowerCase();
      let parsed: any[] = [];

      if (extension === 'csv') {
        const text = await selected.text();
        parsed = await parseCsvFile(text);
      } else if (extension === 'xlsx' || extension === 'xls') {
        const buffer = await selected.arrayBuffer();
        parsed = await parseExcelFile(buffer);
      } else if (extension === 'xml') {
        const text = await selected.text();
        parsed = await parseXmlFile(text);
      } else {
        Alert.alert('Unsupported Format', 'Please upload a valid .csv, .xlsx, or .xml file.');
        setIsLoading(false);
        return;
      }

      if (parsed.length === 0) {
        Alert.alert('Empty File', 'The uploaded file contains no records.');
        setIsLoading(false);
        return;
      }

      const fileHeaders = Object.keys(parsed[0]);
      setParsedRows(parsed);
      setHeaders(fileHeaders);

      const suggested = suggestColumnMappings(fileHeaders, dbFields);
      setMappings(suggested);

      setIsLoading(false);
      setStep(2); // Move to Preview
    } catch (err: any) {
      console.error(err);
      Alert.alert('Parser Error', err.message || 'Failed to parse uploaded file.');
      setIsLoading(false);
    }
  };

  // Preview validation checks
  const handleProceedToValidation = () => {
    setIsLoading(true);
    
    // Check duplicates
    const skus = new Set(products.map(p => p.sku?.toLowerCase() || ''));
    const barcodes = new Set(products.map(p => p.barcode?.toLowerCase() || ''));
    
    const errors: ValidationError[] = [];
    let duplicates = 0;

    parsedRows.forEach((row, i) => {
      const rowErrors = validateImportRow(row, i + 1, dbFields, mappings, categoryId, skus, barcodes);
      errors.push(...rowErrors);

      // Count duplicate rows
      const skuHeader = mappings['sku'];
      const barHeader = mappings['barcode'];
      const nameHeader = mappings['name'];
      
      const skuVal = skuHeader ? String(row[skuHeader] || '').trim().toLowerCase() : '';
      const barVal = barHeader ? String(row[barHeader] || '').trim().toLowerCase() : '';
      const nameVal = nameHeader ? String(row[nameHeader] || '').trim().toLowerCase() : '';

      if ((skuVal && skus.has(skuVal)) || (barVal && barcodes.has(barVal)) || (nameVal && products.some(p => p.name.toLowerCase() === nameVal))) {
        duplicates++;
      }
    });

    setValidationErrorList(errors);
    setDuplicateRowsCount(duplicates);
    setIsLoading(false);
    setStep(3); // Step 3: Validate Screen
  };

  // Handle smart mapping updates
  const handleMapField = (fieldKey: string, headerValue: string) => {
    setMappings(prev => ({
      ...prev,
      [fieldKey]: headerValue
    }));
  };

  // Trigger Bulk Import
  const handleTriggerImport = async () => {
    if (!user || !file) return;

    const activeErrors = validationErrors;
    if (activeErrors.length > 0 && !skipInvalidRows) {
      Alert.alert(
        'Validation Failure',
        'Cannot import. Please resolve the spreadsheet validation errors or select "Skip Invalid Rows" to bypass them.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Filter out rows containing blocker errors if skipping is enabled
    let rowsToImport = [...parsedRows];
    if (activeErrors.length > 0 && skipInvalidRows) {
      const errorIndices = new Set(activeErrors.map(e => e.rowIndex - 1));
      rowsToImport = parsedRows.filter((_, idx) => !errorIndices.has(idx));
    }

    if (rowsToImport.length === 0) {
      Alert.alert('No Valid Rows', 'There are no valid rows to import after skipping errors.');
      return;
    }

    setStep(5); // Step 5: Progress screen

    try {
      await startBackgroundImport(
        file.name,
        rowsToImport,
        mappings,
        user.businessId,
        user.id,
        user.name || user.email,
        {
          duplicateHandling,
          autoCreateCategories,
          categoryId
        }
      );
    } catch (err: any) {
      Alert.alert('Import Failed', err.message || 'An error occurred during batch insertion.');
      setStep(3);
    }
  };

  // Background import status change listener to advance to Step 6
  useEffect(() => {
    if (activeImport) {
      if (activeImport.status === 'completed' || activeImport.status === 'completed_with_errors' || activeImport.status === 'failed') {
        setStep(6);
      }
    }
  }, [activeImport]);

  // Rollback Action
  const handleRollback = (id: string, name: string) => {
    Alert.alert(
      'Confirm Rollback',
      `Are you sure you want to safely rollback and undo the product import "${name}"? This operation cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rollback',
          style: 'destructive',
          onPress: async () => {
            setRollingBackId(id);
            try {
              const res = await rollbackImport(id, user?.businessId || '');
              if (res.success) {
                Alert.alert('Success', 'Import reverted and deleted successfully.');
                await refreshData();
                await loadHistory();
              } else {
                Alert.alert('Rollback Failed', res.message);
              }
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'An error occurred during transaction rollback.');
            } finally {
              setRollingBackId(null);
            }
          }
        }
      ]
    );
  };

  // Export Logic
  const handleTriggerExport = () => {
    // Apply filters
    const filtered = products.filter(p => {
      // Category filter
      if (exportFilters.category !== 'All' && p.category !== exportFilters.category) return false;
      // Brand filter
      if (exportFilters.brand !== 'All' && p.brand !== exportFilters.brand) return false;
      // Supplier filter
      if (exportFilters.supplier !== 'All' && p.supplier !== exportFilters.supplier) return false;
      // Status filter
      if (exportFilters.status !== 'All' && (p.status || 'active') !== exportFilters.status.toLowerCase()) return false;
      
      // Date added filter
      if (exportFilters.startDate) {
        const start = new Date(exportFilters.startDate).getTime();
        const added = new Date(p.lastUpdated).getTime();
        if (added < start) return false;
      }
      if (exportFilters.endDate) {
        const end = new Date(exportFilters.endDate).getTime();
        const added = new Date(p.lastUpdated).getTime();
        if (added > end) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      Alert.alert('No Records', 'No products matched your export filters.');
      return;
    }

    // Format fields
    const formatted = filtered.map(p => ({
      'Product Name': p.name,
      'Category': p.category || 'General',
      'SKU': p.sku || '',
      'Barcode': p.barcode || '',
      'Purchase Price': p.purchasePrice || 0,
      'Selling Price': p.price,
      'Quantity': p.quantity,
      'Unit': p.unit || '',
      'Brand': p.brand || '',
      'Supplier': p.supplier || '',
      'Box Location': p.boxLocation || '',
      'Minimum Stock': p.lowStockThreshold,
      'Tax': p.tax || 0,
      'Description': p.description || '',
      'Status': p.status || 'active',
      'Date Added': p.lastUpdated.split('T')[0]
    }));

    if (Platform.OS === 'web') {
      const fileName = `vaypar_products_export.${exportFormat}`;
      if (exportFormat === 'csv') {
        downloadCsvFile(formatted, fileName);
      } else if (exportFormat === 'xml') {
        downloadXmlFile(formatted, fileName);
      } else {
        downloadExcelFile(formatted, fileName, 'Products Catalog');
      }
    } else {
      Alert.alert(
        'Export Successful',
        `Ready to share ${filtered.length} products. Mobile file downloads are optimized for web access.`
      );
    }
  };

  // Download error log helper
  const handleDownloadErrorLog = () => {
    if (validationErrors.length === 0) return;
    const formattedErrors = validationErrors.map(e => ({
      'Row Number': e.rowIndex,
      'Product Reference': e.rowName,
      'Failed Field': e.field,
      'Cell Value': e.value,
      'Failure Message': e.message
    }));

    if (Platform.OS === 'web') {
      downloadCsvFile(formattedErrors, `import_errors_log.csv`);
    }
  };

  // Categories and Brands lists for export filters
  const filterOptions = useMemo(() => {
    const categories = new Set<string>();
    const brands = new Set<string>();
    const suppliers = new Set<string>();
    
    products.forEach(p => {
      if (p.category) categories.add(p.category);
      if (p.brand) brands.add(p.brand);
      if (p.supplier) suppliers.add(p.supplier);
    });

    return {
      categories: ['All', ...Array.from(categories)],
      brands: ['All', ...Array.from(brands)],
      suppliers: ['All', ...Array.from(suppliers)]
    };
  }, [products]);

  return (
    <ScreenWrapper title="Import / Export">
      {/* Premium Header Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
        {(['import', 'export', 'history'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tabItem,
              activeTab === tab && { borderBottomColor: theme.primary }
            ]}
            onPress={() => {
              setActiveTab(tab);
              if (tab === 'import') setStep(1);
            }}
          >
            <Ionicons 
              name={tab === 'import' ? 'cloud-upload-outline' : tab === 'export' ? 'cloud-download-outline' : 'time-outline'} 
              size={18} 
              color={activeTab === tab ? theme.primary : theme.textSecondary} 
            />
            <Text style={[styles.tabLabel, { color: activeTab === tab ? theme.primary : theme.textSecondary }]}>
              {tab.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* IMPORT FLOW METRICS */}
        {activeTab === 'import' && (
          <Card style={styles.wizardCard}>
            {/* Step Indicators */}
            <View style={styles.wizardIndicatorRow}>
              {[1, 2, 3, 4, 5, 6].map(num => (
                <View key={num} style={styles.indicatorCol}>
                  <View 
                    style={[
                      styles.indicatorCircle, 
                      { 
                        backgroundColor: step === num ? theme.primary : step > num ? theme.success : theme.backgroundSelected,
                        borderColor: step === num ? theme.primary : 'transparent'
                      }
                    ]}
                  >
                    {step > num ? (
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                    ) : (
                      <Text style={{ color: step === num ? '#FFFFFF' : theme.textSecondary, fontSize: 10, fontWeight: '700' }}>
                        {num}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.indicatorText, { color: step === num ? theme.primary : theme.textSecondary }]}>
                    {num === 1 ? 'File' : num === 2 ? 'Preview' : num === 3 ? 'Validate' : num === 4 ? 'Map' : num === 5 ? 'Process' : 'Summary'}
                  </Text>
                </View>
              ))}
            </View>

            {/* STEP 1: CHOOSE FILE */}
            {step === 1 && (
              <View style={styles.wizardStepContainer}>
                <Text style={[styles.stepTitle, { color: theme.text }]}>Choose Spreadsheet File</Text>
                <Text style={[styles.stepDesc, { color: theme.textSecondary }]}>
                  Upload product catalog files in `.csv` or `.xlsx` format. The system automatically detects and maps column structures.
                </Text>

                {/* Official Template Download Card */}
                <View style={[styles.templateBox, { backgroundColor: theme.backgroundElement, borderColor: theme.primary + '40', borderWidth: 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Ionicons name="document-text" size={24} color={theme.primary} style={{ marginRight: 8 }} />
                    <Text style={[styles.templateTitle, { color: theme.text, fontSize: 16, fontWeight: '800' }]}>
                      Official {categoryId.toUpperCase()} Bulk Import Template
                    </Text>
                  </View>
                  <Text style={[styles.templateDesc, { color: theme.textSecondary, marginBottom: 12 }]}>
                    Download our ready-to-use template populated with correct column headers and sample data for your business category. Simply add your items and re-upload below.
                  </Text>

                  {/* Template Column Structure Badges */}
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Template Column Structure:
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {getColumnsForCategory(categoryId).map(col => (
                      <View key={col} style={{ backgroundColor: theme.primary + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: theme.primary + '30' }}>
                        <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700' }}>{col}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Download Action Buttons */}
                  <View style={{ flexDirection: 'row', marginTop: 4 }}>
                    <Button
                      title="Excel Template (.xlsx)"
                      variant="primary"
                      size="medium"
                      icon={<Ionicons name="download-outline" size={18} color="#FFFFFF" />}
                      onPress={() => handleDownloadTemplate('xlsx')}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>

                {/* File Select Area */}
                {Platform.OS === 'web' ? (
                  <View style={[styles.dropZone, { borderColor: theme.primary }]}>
                    <Ionicons name="document-text-outline" size={42} color={theme.primary} />
                    <Text style={[styles.dropText, { color: theme.text }]}>Drag or select CSV, Excel, or XML file here</Text>
                    <input 
                      type="file" 
                      accept=".csv, .xlsx, .xls, .xml" 
                      onChange={handleWebFileSelect} 
                      style={styles.webFileInput}
                    />
                  </View>
                ) : null}

                {/* Simulated Mock upload trigger for app review & offline testing */}
                <View style={styles.simBox}>
                  <Text style={[styles.simText, { color: theme.textSecondary }]}>
                    Simulate importing a sample file to test validation workflows:
                  </Text>
                  <View style={styles.simBtnRow}>
                    <Button
                      title="Simulate Valid Sheet"
                      variant="primaryLight"
                      onPress={() => handleSimulateMockUpload(false)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      title="Simulate Sheet w/ Errors"
                      variant="danger"
                      onPress={() => handleSimulateMockUpload(true)}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>

                {isLoading && <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 20 }} />}
              </View>
            )}

            {/* STEP 2: PREVIEW DATA */}
            {step === 2 && (
              <View style={styles.wizardStepContainer}>
                <Text style={[styles.stepTitle, { color: theme.text }]}>Preview Uploaded Data</Text>
                <Text style={[styles.stepDesc, { color: theme.textSecondary }]}>
                  First few rows of raw parsed data from: <Text style={{ fontWeight: '700', color: theme.text }}>{file?.name}</Text>
                </Text>

                {/* Preview Grid */}
                <ScrollView horizontal style={styles.gridScroll}>
                  <View style={styles.gridTable}>
                    {/* Headers */}
                    <View style={[styles.gridHeaderRow, { borderBottomColor: theme.border }]}>
                      {headers.map(h => (
                        <View key={h} style={styles.gridHeaderCell}><Text style={[styles.gridHeaderText, { color: theme.text }]}>{h}</Text></View>
                      ))}
                    </View>
                    {/* Rows */}
                    {parsedRows.slice(0, 5).map((row, idx) => (
                      <View key={idx} style={[styles.gridBodyRow, { borderBottomColor: theme.border }]}>
                        {headers.map(h => (
                          <View key={h} style={styles.gridBodyCell}><Text style={[styles.gridBodyText, { color: theme.textSecondary }]} numberOfLines={1}>{String(row[h] || '')}</Text></View>
                        ))}
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <Text style={[styles.countLabel, { color: theme.textSecondary }]}>
                  Showing first {Math.min(5, parsedRows.length)} of {parsedRows.length} total rows.
                </Text>

                <View style={styles.actionRow}>
                  <Button
                    title="Back"
                    variant="secondary"
                    onPress={() => setStep(1)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Validate Columns"
                    variant="primary"
                    onPress={handleProceedToValidation}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            )}

            {/* STEP 3: VALIDATION AND CONFIG */}
            {step === 3 && (
              <View style={styles.wizardStepContainer}>
                <Text style={[styles.stepTitle, { color: theme.text }]}>Data Validation & Options</Text>

                {/* Metrics */}
                <View style={styles.metricsBox}>
                  <View style={styles.metricItem}>
                    <Text style={[styles.metricCount, { color: theme.text }]}>{parsedRows.length}</Text>
                    <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Total Rows</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={[styles.metricCount, { color: theme.success }]}>{parsedRows.length - validationErrors.length}</Text>
                    <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Valid Rows</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={[styles.metricCount, { color: validationErrors.length > 0 ? theme.danger : theme.textSecondary }]}>
                      {validationErrors.length}
                    </Text>
                    <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Invalid Rows</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={[styles.metricCount, { color: theme.warning }]}>{duplicateRowsCount}</Text>
                    <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Duplicates</Text>
                  </View>
                </View>

                {/* Option Toggles */}
                <Card style={[styles.optionsCard, { backgroundColor: theme.background }]}>
                  <Text style={[styles.optionsTitle, { color: theme.text }]}>Duplicate Handling Strategy</Text>
                  <View style={styles.btnRadioGroup}>
                    {(['update', 'skip', 'duplicate'] as const).map(option => (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.btnRadio,
                          { 
                            backgroundColor: duplicateHandling === option ? theme.primary : theme.backgroundSelected,
                            borderColor: theme.border
                          }
                        ]}
                        onPress={() => setDuplicateHandling(option)}
                      >
                        <Text style={[styles.btnRadioText, { color: duplicateHandling === option ? '#FFFFFF' : theme.textSecondary }]}>
                          {option === 'update' ? 'Update Existing' : option === 'skip' ? 'Skip Matches' : 'Create Duplicates'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={[styles.toggleLabel, { color: theme.text }]}>Auto-create Missing Categories</Text>
                      <Text style={[styles.toggleSub, { color: theme.textSecondary }]}>Automatically add dynamic categories from sheet to Vaypar</Text>
                    </View>
                    <Switch value={autoCreateCategories} onValueChange={setAutoCreateCategories} />
                  </View>

                  <View style={styles.toggleRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={[styles.toggleLabel, { color: theme.text }]}>Bypass & Skip Invalid Rows</Text>
                      <Text style={[styles.toggleSub, { color: theme.textSecondary }]}>Skip rows with parse errors and import only valid items</Text>
                    </View>
                    <Switch value={skipInvalidRows} onValueChange={setSkipInvalidRows} />
                  </View>
                </Card>

                {/* Errors display */}
                {validationErrors.length > 0 && (
                  <View style={styles.errorsContainer}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={[styles.errorSectionTitle, { color: theme.danger }]}>Validation Error Report</Text>
                      {Platform.OS === 'web' && (
                        <TouchableOpacity onPress={handleDownloadErrorLog}>
                          <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>Download Error CSV</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <ScrollView style={styles.errorLogBox}>
                      {validationErrors.slice(0, 10).map((err, i) => (
                        <View key={i} style={[styles.errorLogItem, { borderBottomColor: theme.border }]}>
                          <Ionicons name="alert-circle" size={14} color={theme.danger} style={{ marginRight: 6 }} />
                          <Text style={[styles.errorLogText, { color: theme.text }]}>
                            Row {err.rowIndex} ({err.rowName}): <Text style={{ fontWeight: '700' }}>{err.field}</Text> is invalid. {err.message}
                          </Text>
                        </View>
                      ))}
                      {validationErrors.length > 10 && (
                        <Text style={[styles.moreErrorsText, { color: theme.textSecondary }]}>
                          ...and {validationErrors.length - 10} more verification logs.
                        </Text>
                      )}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.actionRow}>
                  <Button
                    title="Back"
                    variant="secondary"
                    onPress={() => setStep(2)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Map Column Headers"
                    variant="secondary"
                    onPress={() => setStep(4)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Execute Import"
                    variant="primary"
                    onPress={handleTriggerImport}
                    style={{ flex: 1.5 }}
                    disabled={validationErrors.length > 0 && !skipInvalidRows}
                  />
                </View>
              </View>
            )}

            {/* STEP 4: COLUMN MAPPING CONFIG */}
            {step === 4 && (
              <View style={styles.wizardStepContainer}>
                <Text style={[styles.stepTitle, { color: theme.text }]}>Map Database Columns</Text>
                <Text style={[styles.stepDesc, { color: theme.textSecondary }]}>
                  Align spreadsheet header values (left) to Vaypar catalog structures (right):
                </Text>

                <View style={styles.mappingList}>
                  {dbFields.map(field => {
                    const mappedValue = mappings[field.key] || '';
                    return (
                      <View key={field.key} style={[styles.mappingRow, { borderBottomColor: theme.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.fieldLabel, { color: theme.text }]}>
                            {field.label} {field.required ? '*' : ''}
                          </Text>
                          <Text style={[styles.fieldKeySub, { color: theme.textSecondary }]}>{field.key}</Text>
                        </View>
                        <View style={{ flex: 1.2 }}>
                          {/* We render a dropdown list simulation */}
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                            {headers.map(headerName => {
                              const active = mappings[field.key] === headerName;
                              return (
                                <TouchableOpacity
                                  key={headerName}
                                  style={[
                                    styles.mapChip,
                                    { 
                                      backgroundColor: active ? theme.primaryLight : theme.backgroundSelected,
                                      borderColor: active ? theme.primary : theme.border
                                    }
                                  ]}
                                  onPress={() => handleMapField(field.key, headerName)}
                                >
                                  <Text style={[styles.mapChipText, { color: active ? theme.primary : theme.textSecondary }]}>
                                    {headerName}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.actionRow}>
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={() => setStep(3)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Apply & Validate"
                    variant="primary"
                    onPress={handleProceedToValidation}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            )}

            {/* STEP 5: PROGRESS SCREEN */}
            {step === 5 && activeImport && (
              <View style={styles.wizardStepContainer}>
                <Text style={[styles.stepTitle, { color: theme.text }]}>Processing Products Catalog...</Text>
                <Text style={[styles.stepDesc, { color: theme.textSecondary }]}>
                  Please do not lock your device. Writing records to local SQLite.
                </Text>

                <View style={styles.progressContainer}>
                  {/* Progress bar */}
                  <View style={[styles.progressBarBg, { backgroundColor: theme.backgroundSelected }]}>
                    <View 
                      style={[
                        styles.progressBarFill, 
                        { 
                          backgroundColor: theme.primary,
                          width: `${(activeImport.importedCount / activeImport.totalCount) * 100}%`
                        }
                      ]} 
                    />
                  </View>
                  <View style={styles.progressTextRow}>
                    <Text style={[styles.progressPctText, { color: theme.text }]}>
                      {Math.round((activeImport.importedCount / activeImport.totalCount) * 100)}%
                    </Text>
                    <Text style={[styles.progressRatioText, { color: theme.textSecondary }]}>
                      {activeImport.importedCount} / {activeImport.totalCount} Products Imported
                    </Text>
                  </View>
                </View>

                <Card style={[styles.importMetricsCard, { backgroundColor: theme.background }]}>
                  <View style={styles.progressMetricRow}>
                    <Text style={[styles.progressMetricText, { color: theme.text }]}>Current Product:</Text>
                    <Text style={[styles.progressMetricValue, { color: theme.primary }]} numberOfLines={1}>
                      {activeImport.currentProductName || 'Processing...'}
                    </Text>
                  </View>
                  <View style={styles.progressMetricRow}>
                    <Text style={[styles.progressMetricText, { color: theme.text }]}>ETA Remaining:</Text>
                    <Text style={[styles.progressMetricValue, { color: theme.text }]}>
                      {activeImport.etaSeconds > 0 ? `${activeImport.etaSeconds} seconds` : 'Finishing...'}
                    </Text>
                  </View>
                </Card>

                <View style={styles.actionRow}>
                  <Button
                    title="Cancel Import"
                    variant="danger"
                    onPress={cancelActiveImport}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Run in Background"
                    variant="primary"
                    onPress={() => {
                      // Navigate back to products list
                      router.push('/products');
                      Alert.alert(
                        'Background Mode',
                        'Product import is now running in the background. You can continue using Vaypar. A notification will trigger on completion.',
                        [{ text: 'OK' }]
                      );
                    }}
                    style={{ flex: 1.5 }}
                  />
                </View>
              </View>
            )}

            {/* STEP 6: IMPORT SUMMARY */}
            {step === 6 && activeImport && (
              <View style={styles.wizardStepContainer}>
                <Text style={[styles.stepTitle, { color: theme.text }]}>Import Executed</Text>
                
                {/* Result Message */}
                <View style={[styles.resultBanner, { backgroundColor: activeImport.failedCount > 0 ? theme.danger + '15' : theme.success + '15', borderColor: activeImport.failedCount > 0 ? theme.danger : theme.success }]}>
                  <Ionicons 
                    name={activeImport.failedCount > 0 ? 'warning-outline' : 'checkmark-circle-outline'} 
                    size={28} 
                    color={activeImport.failedCount > 0 ? theme.danger : theme.success} 
                  />
                  <Text style={[styles.resultBannerText, { color: activeImport.failedCount > 0 ? theme.danger : theme.success }]}>
                    {activeImport.failedCount > 0 ? 'Batch Import Completed with Errors' : 'Batch Import Completed Successfully!'}
                  </Text>
                </View>

                {/* Final Summary Matrix */}
                <View style={styles.summaryMatrix}>
                  <View style={[styles.summaryItem, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.summaryLabel, { color: theme.text }]}>Total Processed</Text>
                    <Text style={[styles.summaryVal, { color: theme.text }]}>{activeImport.totalCount}</Text>
                  </View>
                  <View style={[styles.summaryItem, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.summaryLabel, { color: theme.success }]}>Successfully Created</Text>
                    <Text style={[styles.summaryVal, { color: theme.success }]}>{activeImport.successCount}</Text>
                  </View>
                  <View style={[styles.summaryItem, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.summaryLabel, { color: theme.primary }]}>Successfully Updated</Text>
                    <Text style={[styles.summaryVal, { color: theme.primary }]}>{activeImport.updatedCount}</Text>
                  </View>
                  <View style={[styles.summaryItem, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.summaryLabel, { color: theme.warning }]}>Skipped Duplicates</Text>
                    <Text style={[styles.summaryVal, { color: theme.warning }]}>{activeImport.skippedCount}</Text>
                  </View>
                  <View style={[styles.summaryItem, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.summaryLabel, { color: theme.danger }]}>Failed Rows</Text>
                    <Text style={[styles.summaryVal, { color: theme.danger }]}>{activeImport.failedCount}</Text>
                  </View>
                </View>

                {activeImport.errorsList.length > 0 && (
                  <View style={styles.errorsContainer}>
                    <Text style={[styles.errorSectionTitle, { color: theme.danger }]}>Blocked Entries Log</Text>
                    <ScrollView style={styles.errorLogBox}>
                      {activeImport.errorsList.slice(0, 10).map((err, i) => (
                        <View key={i} style={[styles.errorLogItem, { borderBottomColor: theme.border }]}>
                          <Ionicons name="close-circle" size={14} color={theme.danger} style={{ marginRight: 6 }} />
                          <Text style={[styles.errorLogText, { color: theme.text }]}>{err}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.actionRow}>
                  <Button
                    title="Clear Summary & Exit"
                    variant="primary"
                    onPress={() => {
                      clearActiveImport();
                      router.push('/products');
                    }}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            )}
          </Card>
        )}

        {/* ROLLBACK & HISTORY PANEL */}
        {activeTab === 'history' && (
          <View style={styles.historyContainer}>
            <Text style={[styles.sectionHeading, { color: theme.text }]}>Import Activity History Log</Text>
            <Text style={[styles.sectionSub, { color: theme.textSecondary }]}>
              Rollback allows you to safely undo any product inserts or updates from a specific spreadsheet file.
            </Text>

            {loadingHistory ? (
              <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
            ) : historyList.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="time-outline" size={48} color={theme.textSecondary + '60'} />
                <Text style={[styles.emptyCardText, { color: theme.textSecondary }]}>No bulk product import history logged yet.</Text>
              </Card>
            ) : (
              <View style={styles.historyList}>
                {historyList.map(log => (
                  <Card key={log.id} style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.historyFileTitle, { color: theme.text }]} numberOfLines={1}>{log.fileName}</Text>
                        <Text style={[styles.historyMeta, { color: theme.textSecondary }]}>
                          Uploaded: {new Date(log.importDate).toLocaleString()} by {log.userName}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { 
                        backgroundColor: log.status === 'completed' ? theme.success + '15' 
                          : log.status === 'rolled_back' ? theme.textSecondary + '15' 
                          : theme.danger + '15' 
                      }]}>
                        <Text style={[styles.statusBadgeText, { 
                          color: log.status === 'completed' ? theme.success 
                            : log.status === 'rolled_back' ? theme.textSecondary 
                            : theme.danger 
                        }]}>
                          {log.status === 'completed' ? 'Success' 
                            : log.status === 'rolled_back' ? 'Rolled Back' 
                            : 'Completed w/ Errors'}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.historyStats, { borderTopColor: theme.border, borderBottomColor: theme.border }]}>
                      <Text style={[styles.historyStatText, { color: theme.textSecondary }]}>
                        Total: <Text style={{ color: theme.text, fontWeight: '700' }}>{log.totalRecords}</Text>  |  
                        Created: <Text style={{ color: theme.success, fontWeight: '700' }}>{log.successCount}</Text>  |  
                        Updated: <Text style={{ color: theme.primary, fontWeight: '700' }}>{log.updatedCount}</Text>  |  
                        Failed: <Text style={{ color: theme.danger, fontWeight: '700' }}>{log.failedCount}</Text>
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8 }}>
                      {log.status !== 'rolled_back' ? (
                        <TouchableOpacity
                          style={[styles.actionBtnRollback, { backgroundColor: theme.danger + '15' }]}
                          disabled={rollingBackId !== null}
                          onPress={() => handleRollback(log.id, log.fileName)}
                        >
                          {rollingBackId === log.id ? (
                            <ActivityIndicator size="small" color={theme.danger} />
                          ) : (
                            <>
                              <Ionicons name="refresh-outline" size={14} color={theme.danger} style={{ marginRight: 4 }} />
                              <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 12 }}>Rollback Import</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <Text style={{ color: theme.textSecondary, fontSize: 12, fontStyle: 'italic' }}>Reverted</Text>
                      )}
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </View>
        )}

        {/* FILTERED EXPORTS PANEL */}
        {activeTab === 'export' && (
          <View style={styles.exportContainer}>
            <Text style={[styles.sectionHeading, { color: theme.text }]}>Export Products Database</Text>
            <Text style={[styles.sectionSub, { color: theme.textSecondary }]}>
              Export your catalog entries in CSV or Excel format. Filter by category, status, or supplier to refine details.
            </Text>

            <Card style={styles.exportCard}>
              <Text style={[styles.exportCardTitle, { color: theme.text }]}>Export Configurations</Text>

              {/* Format selection */}
              <Text style={[styles.filterLabel, { color: theme.text }]}>Export Format</Text>
              <View style={styles.btnFormatGroup}>
                {(['csv', 'xlsx', 'xml'] as const).map(fmt => (
                  <TouchableOpacity
                    key={fmt}
                    style={[
                      styles.btnFormat,
                      { 
                        backgroundColor: exportFormat === fmt ? theme.primary : theme.backgroundSelected,
                        borderColor: theme.border
                      }
                    ]}
                    onPress={() => setExportFormat(fmt)}
                  >
                    <Text style={[styles.btnRadioText, { color: exportFormat === fmt ? '#FFFFFF' : theme.textSecondary }]}>
                      {fmt === 'csv' ? 'CSV (.csv)' : fmt === 'xlsx' ? 'Excel (.xlsx)' : 'XML (.xml)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Filters */}
              <View style={styles.filterGrid}>
                {/* Category filter */}
                <View style={styles.filterGridCol}>
                  <Text style={[styles.filterLabel, { color: theme.text }]}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                    {filterOptions.categories.map(cat => (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.filterChip,
                          exportFilters.category === cat ? { backgroundColor: theme.primary } : { backgroundColor: theme.backgroundSelected }
                        ]}
                        onPress={() => setExportFilters(prev => ({ ...prev, category: cat }))}
                      >
                        <Text style={{ fontSize: 11, color: exportFilters.category === cat ? '#FFFFFF' : theme.textSecondary, fontWeight: '700' }}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Brand filter */}
                <View style={styles.filterGridCol}>
                  <Text style={[styles.filterLabel, { color: theme.text }]}>Brand</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                    {filterOptions.brands.map(brand => (
                      <TouchableOpacity
                        key={brand}
                        style={[
                          styles.filterChip,
                          exportFilters.brand === brand ? { backgroundColor: theme.primary } : { backgroundColor: theme.backgroundSelected }
                        ]}
                        onPress={() => setExportFilters(prev => ({ ...prev, brand }))}
                      >
                        <Text style={{ fontSize: 11, color: exportFilters.brand === brand ? '#FFFFFF' : theme.textSecondary, fontWeight: '700' }}>
                          {brand}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Status filter */}
                <View style={styles.filterGridCol}>
                  <Text style={[styles.filterLabel, { color: theme.text }]}>Status</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
                    {['All', 'Active', 'Inactive'].map(status => (
                      <TouchableOpacity
                        key={status}
                        style={[
                          styles.filterChip,
                          exportFilters.status === status ? { backgroundColor: theme.primary } : { backgroundColor: theme.backgroundSelected }
                        ]}
                        onPress={() => setExportFilters(prev => ({ ...prev, status }))}
                      >
                        <Text style={{ fontSize: 11, color: exportFilters.status === status ? '#FFFFFF' : theme.textSecondary, fontWeight: '700' }}>
                          {status}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <Button
                title="Generate & Download Catalog"
                variant="primary"
                size="large"
                onPress={handleTriggerExport}
                style={{ marginTop: 24 }}
              />
            </Card>
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 64,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    height: 52,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  wizardCard: {
    padding: 20,
    borderRadius: 16,
  },
  wizardIndicatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    paddingBottom: 16,
  },
  indicatorCol: {
    alignItems: 'center',
    flex: 1,
  },
  indicatorCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  indicatorText: {
    fontSize: 9,
    fontWeight: '700',
  },
  wizardStepContainer: {
    paddingTop: 8,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  stepDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  templateBox: {
    borderWidth: 1,
    borderColor: 'rgba(109, 93, 246, 0.15)',
    backgroundColor: 'rgba(109, 93, 246, 0.03)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  templateTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  templateDesc: {
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 16,
  },
  templateBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  dropText: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  webFileInput: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    cursor: 'pointer',
    width: '100%',
    height: '100%',
  },
  simBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(0,0,0,0.01)',
  },
  simText: {
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 16,
  },
  simBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  gridScroll: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 8,
  },
  gridTable: {
    flexDirection: 'column',
  },
  gridHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.02)',
    paddingVertical: 8,
  },
  gridHeaderCell: {
    width: 130,
    paddingHorizontal: 8,
  },
  gridHeaderText: {
    fontSize: 11,
    fontWeight: '800',
  },
  gridBodyRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  gridBodyCell: {
    width: 130,
    paddingHorizontal: 8,
  },
  gridBodyText: {
    fontSize: 11,
  },
  countLabel: {
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  metricsBox: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricCount: {
    fontSize: 18,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  optionsCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  optionsTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  btnRadioGroup: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  btnRadio: {
    flex: 1,
    borderWidth: 1,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnRadioText: {
    fontSize: 11,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  toggleSub: {
    fontSize: 10,
    marginTop: 1,
  },
  errorsContainer: {
    marginBottom: 16,
  },
  errorSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  errorLogBox: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    backgroundColor: 'rgba(239, 68, 68, 0.02)',
    borderRadius: 10,
    padding: 10,
  },
  errorLogItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 0.5,
    paddingVertical: 6,
  },
  errorLogText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
  moreErrorsText: {
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: 6,
    fontStyle: 'italic',
  },
  mappingList: {
    marginVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  mappingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  fieldKeySub: {
    fontSize: 10,
    fontStyle: 'italic',
  },
  mapChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  progressContainer: {
    marginVertical: 20,
  },
  progressBarBg: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressPctText: {
    fontSize: 18,
    fontWeight: '900',
  },
  progressRatioText: {
    fontSize: 12,
    fontWeight: '600',
  },
  importMetricsCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  progressMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressMetricText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressMetricValue: {
    fontSize: 12,
    fontWeight: '800',
    flex: 0.8,
    textAlign: 'right',
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  resultBannerText: {
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  summaryMatrix: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 16,
  },
  historyContainer: {
    paddingTop: 8,
  },
  emptyCard: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  emptyCardText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  historyList: {
    gap: 12,
  },
  historyCard: {
    padding: 16,
    borderRadius: 14,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  historyFileTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  historyMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  historyStats: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 10,
    marginVertical: 4,
  },
  historyStatText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionBtnRollback: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  exportContainer: {
    paddingTop: 8,
  },
  exportCard: {
    padding: 20,
    borderRadius: 16,
  },
  exportCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 16,
  },
  btnFormatGroup: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 16,
  },
  btnFormat: {
    borderWidth: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  filterGrid: {
    gap: 12,
  },
  filterGridCol: {
    flexDirection: 'column',
  },
  filterChipsRow: {
    gap: 6,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
});
