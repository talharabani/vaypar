import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/use-theme';
import {
  AIConversation,
  AIMessage,
  BusinessAIContextData,
  clearAllAIConversations,
  createAIConversation,
  DEFAULT_GROQ_KEY,
  deleteAIConversation,
  getActiveGroqKey,
  getAIConversations,
  getAIMessages,
  getBusinessAIContext,
  getSavedAIModel,
  saveActiveGroqKey,
  saveAIModel,
  saveAIMessage,
  safeFormatNumber,
  sendChatMessageToGroq,
  SUPPORTED_AI_MODELS,
  SupportedAIModel,
} from '../services/aiService';

const URDU_QUICK_PROMPTS = [
  { label: '📊 Aaj Ki Sale', prompt: 'Aaj ki total sale aur revenue kitna hua hai?' },
  { label: '⚠️ Kam Stock', prompt: 'Konsay products low stock ya out of stock hain?' },
  { label: '📋 Udhar Status', prompt: 'Customers ka pending udhar / khata balance kitna hai?' },
  { label: '🔥 Top Items', prompt: 'Sab se zyada bikne walay products kon se hain?' },
  { label: '📈 Highest Profit', prompt: 'Highest profit margin walay items kon se hain?' },
  { label: '🖨️ POS & Slips', prompt: 'Thermal printer aur invoice settings kaise kaam karti hain?' },
];

interface QuickCard {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  prompt: string;
  color: string;
}

const QUICK_STARTS: QuickCard[] = [
  {
    id: 'low_stock',
    icon: 'warning-outline',
    title: 'Check Low Stock',
    desc: 'List products below alert threshold & items requiring re-order.',
    prompt: 'Which products in my store are currently running low on stock or completely out of stock?',
    color: '#D97706',
  },
  {
    id: 'top_sales',
    icon: 'trending-up-outline',
    title: 'Top Selling Items',
    desc: 'Analyze best-selling inventory by volume and total sales revenue.',
    prompt: 'What are my top selling products by volume and revenue generated?',
    color: '#2563EB',
  },
  {
    id: 'profit_margin',
    icon: 'cash-outline',
    title: 'Profit & Margins',
    desc: 'Identify products with highest profit margins and markups.',
    prompt: 'Which products yield the highest profit margins based on my purchase and selling prices?',
    color: '#16A34A',
  },
  {
    id: 'pos_guide',
    icon: 'settings-outline',
    title: 'POS & Settings Guide',
    desc: 'Guide on thermal printers, order numbering, cloud sync & tax.',
    prompt: 'Explain how order sequencing (#ORD-YYYY-XXXX), thermal printing, and business settings work in Vaypar.',
    color: '#7C3AED',
  },
];

export default function VayparAIScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<'chats' | 'insights' | 'settings'>('chats');
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<AIConversation | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [contextData, setContextData] = useState<BusinessAIContextData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // AI Model & Key Management
  const [selectedModel, setSelectedModel] = useState<string>('qwen/qwen3.8-27b');
  const [showModelModal, setShowModelModal] = useState<boolean>(false);
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [customKeyInput, setCustomKeyInput] = useState<string>('');
  const [testingKey, setTestingKey] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [activeKey, setActiveKey] = useState<string>('');

  const businessId = user?.businessId || user?.id || 'local_business';
  const businessName = user?.businessName || user?.name || 'My Business';

  // Screen Width for Responsive Desktop vs Mobile layout
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);
  const isDesktop = screenWidth >= 860;

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setScreenWidth(window.width);
    });
    return () => sub?.remove();
  }, []);

  // Time of Day Greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    let prefix = 'Good morning';
    if (hour >= 12 && hour < 17) {
      prefix = 'Good afternoon';
    } else if (hour >= 17 && hour < 21) {
      prefix = 'Good evening';
    } else if (hour >= 21 || hour < 5) {
      prefix = 'Good night';
    }
    return `${prefix}, ${businessName}`;
  }, [businessName]);

  // Load Business AI Context & Conversations & Model Preferences on mount
  useEffect(() => {
    loadConversations();
    getBusinessAIContext(businessId, user || {}).then(setContextData).catch(console.warn);
    getSavedAIModel().then(setSelectedModel).catch(console.warn);
    getActiveGroqKey().then((key) => {
      setActiveKey(key);
      setCustomKeyInput(key);
    }).catch(console.warn);
  }, [businessId, user]);

  const loadConversations = async () => {
    try {
      const list = await getAIConversations(businessId);
      setConversations(list);
    } catch (err) {
      console.warn('Failed to load conversations:', err);
    }
  };

  const selectConversation = async (conv: AIConversation) => {
    setCurrentConversation(conv);
    try {
      const msgs = await getAIMessages(conv.id);
      setMessages(msgs);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      if (!isDesktop) setSidebarOpen(false);
    } catch (err) {
      console.warn('Failed to load messages:', err);
    }
  };

  const handleStartNewChat = () => {
    setCurrentConversation(null);
    setMessages([]);
    setInputMessage('');
    if (!isDesktop) setSidebarOpen(false);
  };

  const handleDeleteConversation = async (id: string, e: any) => {
    e.stopPropagation();
    try {
      await deleteAIConversation(id);
      if (currentConversation?.id === id) {
        handleStartNewChat();
      }
      loadConversations();
    } catch (err) {
      Alert.alert('Error', 'Failed to delete conversation.');
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Conversations',
      'Are you sure you want to delete all saved conversations?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearAllAIConversations(businessId);
            handleStartNewChat();
            loadConversations();
          },
        },
      ]
    );
  };

  const handleSelectModel = async (modelId: string) => {
    setSelectedModel(modelId);
    await saveAIModel(modelId);
    setShowModelModal(false);
  };

  const handleSaveApiKey = async () => {
    try {
      await saveActiveGroqKey(customKeyInput);
      const newKey = await getActiveGroqKey();
      setActiveKey(newKey);
      setShowKeyModal(false);
      Alert.alert('Saved', 'Groq API Key updated successfully.');
    } catch {
      Alert.alert('Error', 'Failed to save Groq API Key.');
    }
  };

  const handleResetApiKey = async () => {
    await saveActiveGroqKey('');
    setActiveKey(DEFAULT_GROQ_KEY);
    setCustomKeyInput(DEFAULT_GROQ_KEY);
    setTestResult(null);
    Alert.alert('Reset', 'Default Groq API Key restored.');
  };

  const handleTestConnection = async () => {
    setTestingKey(true);
    setTestResult(null);
    try {
      const keyToTest = customKeyInput.trim() || activeKey;
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keyToTest}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: 'user', content: 'Salam' }],
          max_completion_tokens: 10,
          reasoning_format: 'hidden',
        }),
      });
      if (res.ok) {
        setTestResult({ ok: true, msg: 'Connected successfully! AI engine is online.' });
      } else {
        const txt = await res.text();
        setTestResult({ ok: false, msg: `Failed (${res.status}): ${txt.slice(0, 100)}` });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err?.message || 'Connection test failed.' });
    } finally {
      setTestingKey(false);
    }
  };

  const handleCopyText = async (text: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        Alert.alert('Copied', 'Message copied to clipboard.');
      } else {
        Alert.alert('Copied', text.slice(0, 60) + '...');
      }
    } catch {
      Alert.alert('Notice', 'Could not copy message.');
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputMessage).trim();
    if (!textToSend || isLoading) return;

    setInputMessage('');
    setIsLoading(true);

    try {
      // 1. Ensure conversation exists
      let conv = currentConversation;
      if (!conv) {
        const title = textToSend.length > 32 ? textToSend.substring(0, 32) + '...' : textToSend;
        conv = await createAIConversation(businessId, title);
        setCurrentConversation(conv);
      }

      // 2. Save user message locally
      const userMsg = await saveAIMessage(conv.id, businessId, 'user', textToSend);
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);

      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50);

      // 3. Refresh live business context for fresh accuracy
      const liveContext = contextData || (await getBusinessAIContext(businessId, user || {}));
      setContextData(liveContext);

      // 4. Query Groq AI with multi-model cascade & offline intelligence fallback
      const aiReplyText = await sendChatMessageToGroq(
        textToSend,
        newMessages,
        liveContext,
        activeKey,
        selectedModel
      );

      // 5. Save assistant reply locally
      const assistantMsg = await saveAIMessage(conv.id, businessId, 'assistant', aiReplyText);
      setMessages((prev) => [...prev, assistantMsg]);

      // 6. Refresh recent conversations list
      loadConversations();
    } catch (err: any) {
      console.warn('[Vaypar AI Error]', err);
      const errMsg = err?.message || 'Could not connect to Groq AI. Please check internet connection.';
      if (currentConversation) {
        try {
          const errAssistantMsg = await saveAIMessage(
            currentConversation.id,
            businessId,
            'assistant',
            `⚠️ **Notice:**\n${errMsg}`
          );
          setMessages((prev) => [...prev, errAssistantMsg]);
        } catch (_) {}
      }
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // Filtered Conversations for Search
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    return conversations.filter((c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [conversations, searchQuery]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      {/* Top OS Window Bar (Reference Aesthetic) */}
      <View style={[styles.topWindowBar, { borderBottomColor: theme.border }]}>
        <View style={styles.macDots}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.dot, { backgroundColor: '#FF5F56' }]} />
          <View style={[styles.dot, { backgroundColor: '#FFBD2E' }]} />
          <View style={[styles.dot, { backgroundColor: '#27C93F' }]} />
        </View>

        {/* Center Pill Switcher */}
        <View style={[styles.topCenterPill, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <TouchableOpacity
            onPress={() => setActiveTab('chats')}
            style={[styles.topTabBtn, activeTab === 'chats' && { backgroundColor: theme.primaryLight }]}
          >
            <Text style={[styles.topTabBtnText, { color: activeTab === 'chats' ? theme.text : theme.textMuted }]}>
              Chats
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('insights')}
            style={[styles.topTabBtn, activeTab === 'insights' && { backgroundColor: theme.primaryLight }]}
          >
            <Text style={[styles.topTabBtnText, { color: activeTab === 'insights' ? theme.text : theme.textMuted }]}>
              Live Data
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('settings')}
            style={[styles.topTabBtn, activeTab === 'settings' && { backgroundColor: theme.primaryLight }]}
          >
            <Text style={[styles.topTabBtnText, { color: activeTab === 'settings' ? theme.text : theme.textMuted }]}>
              POS Intel
            </Text>
          </TouchableOpacity>
        </View>

        {/* Right Menu / Sidebar toggle for mobile */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {!isDesktop && (
            <TouchableOpacity
              onPress={() => setSidebarOpen(!sidebarOpen)}
              style={[styles.iconButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
            >
              <Ionicons name={sidebarOpen ? 'close' : 'menu'} size={18} color={theme.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.iconButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
          >
            <Ionicons name="arrow-back" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Split Layout */}
      <View style={styles.splitLayout}>
        {/* ========================================================================= */}
        {/* LEFT SIDEBAR (Matching reference image) */}
        {/* ========================================================================= */}
        {(isDesktop || sidebarOpen) && (
          <View
            style={[
              styles.sidebar,
              {
                backgroundColor: theme.backgroundElement,
                borderRightColor: theme.border,
                width: isDesktop ? 270 : '85%',
                position: isDesktop ? 'relative' : 'absolute',
                zIndex: isDesktop ? 1 : 100,
                height: '100%',
              },
            ]}
          >
            {/* + New Chat Button */}
            <TouchableOpacity
              style={[styles.newChatBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
              onPress={handleStartNewChat}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color={theme.primary} />
              <Text style={[styles.newChatText, { color: theme.primary }]}>New chat</Text>
            </TouchableOpacity>

            {/* Search Input */}
            <View style={[styles.searchBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Ionicons name="search" size={15} color={theme.textMuted} />
              <TextInput
                placeholder="Search"
                placeholderTextColor={theme.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={[styles.searchInput, { color: theme.text }]}
              />
            </View>

            {/* Quick Section Shortcuts */}
            <View style={styles.quickNavSection}>
              <TouchableOpacity style={styles.quickNavItem} onPress={() => handleSendMessage('Give me a full executive business overview.')}>
                <Ionicons name="chatbubbles-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.quickNavText, { color: theme.textSecondary }]}>Chats</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickNavItem} onPress={() => handleSendMessage('Show me all inventory and low stock items.')}>
                <Ionicons name="cube-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.quickNavText, { color: theme.textSecondary }]}>Inventory</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickNavItem} onPress={() => handleSendMessage('How much are today and all-time total sales revenue?')}>
                <Ionicons name="receipt-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.quickNavText, { color: theme.textSecondary }]}>Sales & Bills</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickNavItem} onPress={() => handleSendMessage('Explain how thermal printers and slip customization work in Vaypar.')}>
                <Ionicons name="settings-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.quickNavText, { color: theme.textSecondary }]}>Settings Help</Text>
              </TouchableOpacity>
            </View>

            {/* RECENTS Header */}
            <View style={styles.recentsHeader}>
              <Text style={[styles.recentsTitle, { color: theme.textMuted }]}>RECENTS</Text>
              {conversations.length > 0 && (
                <TouchableOpacity onPress={handleClearAll}>
                  <Text style={{ fontSize: 11, color: theme.danger, fontWeight: '600' }}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Recents List */}
            <ScrollView style={styles.recentsList} showsVerticalScrollIndicator={false}>
              {filteredConversations.length === 0 ? (
                <Text style={[styles.emptyRecentsText, { color: theme.textMuted }]}>
                  {searchQuery ? 'No matching chats' : 'No previous conversations'}
                </Text>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected = currentConversation?.id === conv.id;
                  return (
                    <TouchableOpacity
                      key={conv.id}
                      onPress={() => selectConversation(conv)}
                      style={[
                        styles.recentItem,
                        isSelected && { backgroundColor: theme.primaryLight },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.recentItemTitle,
                            { color: isSelected ? theme.primary : theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          {conv.title}
                        </Text>
                        <Text style={[styles.recentItemDate, { color: theme.textMuted }]}>
                          {new Date(conv.lastUpdated).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={(e) => handleDeleteConversation(conv.id, e)}
                        style={styles.deleteIconBtn}
                      >
                        <Ionicons name="trash-outline" size={14} color={theme.textMuted} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* User Profile Footer Pill */}
            <View style={[styles.profileFooter, { borderTopColor: theme.border }]}>
              <View style={[styles.avatarCircle, { backgroundColor: theme.primary }]}>
                <Text style={styles.avatarText}>
                  {businessName.substring(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
                  {businessName}
                </Text>
                <Text style={[styles.profileEmail, { color: theme.textMuted }]} numberOfLines={1}>
                  {user?.email || contextData?.categoryLabel || 'Active Store'}
                </Text>
              </View>
              <Ionicons name="sparkles" size={16} color={theme.accent || '#C5A880'} />
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* RIGHT MAIN CANVAS (Matching reference image) */}
        {/* ========================================================================= */}
        <View style={[styles.mainCanvas, { backgroundColor: theme.background }]}>
          {activeTab === 'insights' ? (
            /* Live Data Insights View */
            <ScrollView contentContainerStyle={styles.insightsScroll}>
              <Text style={[styles.greetingTitle, { color: theme.text, marginTop: 20 }]}>
                {businessName} Live Insights
              </Text>
              <Text style={{ color: theme.textSecondary, marginBottom: 20 }}>
                Category: {contextData?.categoryLabel} · Strictly Isolated
              </Text>

              <View style={styles.statsGrid}>
                <View style={[styles.statBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <Text style={[styles.statValue, { color: theme.primary }]}>{contextData?.totalProductsCount || 0}</Text>
                  <Text style={[styles.statLabel, { color: theme.textMuted }]}>Total Products</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <Text style={[styles.statValue, { color: '#D97706' }]}>{contextData?.lowStockItems?.length || 0}</Text>
                  <Text style={[styles.statLabel, { color: theme.textMuted }]}>Low Stock Alert</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <Text style={[styles.statValue, { color: '#16A34A' }]}>
                    PKR {safeFormatNumber(contextData?.recentSalesToday)}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.textMuted }]}>Today Sales</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <Text style={[styles.statValue, { color: '#2563EB' }]}>
                    PKR {safeFormatNumber(contextData?.totalSalesRevenue)}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.textMuted }]}>All-Time Revenue</Text>
                </View>
              </View>

              <Text style={[styles.sectionHeading, { color: theme.text }]}>Top Selling Items</Text>
              {(contextData?.topSellingProducts || []).map((p, idx) => (
                <View key={idx} style={[styles.insightRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <Text style={{ fontWeight: '700', color: theme.text }}>{idx + 1}. {p.name}</Text>
                  <Text style={{ color: theme.primary, fontWeight: '700' }}>{safeFormatNumber(p.totalQtySold)} sold · PKR {safeFormatNumber(p.totalRevenue)}</Text>
                </View>
              ))}

              <Text style={[styles.sectionHeading, { color: theme.text, marginTop: 24 }]}>Highest Profit Margins</Text>
              {(contextData?.highProfitMarginProducts || []).map((p, idx) => (
                <View key={idx} style={[styles.insightRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <Text style={{ fontWeight: '600', color: theme.text }}>{p.name}</Text>
                  <Text style={{ color: '#16A34A', fontWeight: '800' }}>{safeFormatNumber(p.marginPercent)}% Margin (Cost: {safeFormatNumber(p.purchasePrice)} → Sale: {safeFormatNumber(p.price)})</Text>
                </View>
              ))}
            </ScrollView>
          ) : activeTab === 'settings' ? (
            /* System Settings Intel View */
            <ScrollView contentContainerStyle={styles.insightsScroll}>
              <Text style={[styles.greetingTitle, { color: theme.text, marginTop: 20 }]}>
                POS & Settings Knowledge Base
              </Text>
              <Text style={{ color: theme.textSecondary, marginBottom: 20 }}>
                Learn how Vaypar operates your multi-industry store
              </Text>

              <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Ionicons name="hardware-chip-outline" size={24} color={theme.primary} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '700', fontSize: 15, color: theme.text }}>AI Model Engine</Text>
                    <TouchableOpacity
                      onPress={() => setShowModelModal(true)}
                      style={{
                        backgroundColor: theme.primaryLight,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>Change</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
                    Active Engine: <Text style={{ fontWeight: '700', color: theme.text }}>{SUPPORTED_AI_MODELS.find((m) => m.id === selectedModel)?.name || 'Qwen 3.8 27B'}</Text>
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                    {SUPPORTED_AI_MODELS.find((m) => m.id === selectedModel)?.desc}
                  </Text>
                </View>
              </View>

              <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Ionicons name="key-outline" size={24} color={theme.primary} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '700', fontSize: 15, color: theme.text }}>Groq AI Key & Status</Text>
                    <TouchableOpacity
                      onPress={() => setShowKeyModal(true)}
                      style={{
                        backgroundColor: theme.primaryLight,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>Config Key</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
                    Key: {activeKey ? `${activeKey.substring(0, 8)}...${activeKey.slice(-4)}` : 'Default In-App Key'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      onPress={handleTestConnection}
                      disabled={testingKey}
                      style={{
                        backgroundColor: theme.primary,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {testingKey ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons name="flash-outline" size={14} color="#FFFFFF" />
                      )}
                      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                        {testingKey ? 'Testing...' : 'Test Connection'}
                      </Text>
                    </TouchableOpacity>
                    {testResult && (
                      <Text style={{ fontSize: 12, color: testResult.ok ? '#16A34A' : theme.danger, flexShrink: 1, fontWeight: '600' }}>
                        {testResult.msg}
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Ionicons name="receipt-outline" size={24} color={theme.primary} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ fontWeight: '700', fontSize: 15, color: theme.text }}>Order Number Sequencing</Text>
                  <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
                    Sequence starts from #ORD-2026-0000. When 2027 arrives, it cleanly adapts to #ORD-2027-0000 automatically.
                  </Text>
                </View>
              </View>

              <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Ionicons name="print-outline" size={24} color={theme.primary} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ fontWeight: '700', fontSize: 15, color: theme.text }}>Dynamic Business Slips</Text>
                  <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
                    Electric and retail stores get clean receipts without Dine-In or Table numbers. Restaurant businesses automatically include table & token numbers.
                  </Text>
                </View>
              </View>

              <View style={[styles.infoCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Ionicons name="image-outline" size={24} color={theme.primary} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ fontWeight: '700', fontSize: 15, color: theme.text }}>Owner Logo & Customer Phone</Text>
                  <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
                    Store logo prints on top of thermal receipts. Customer phone is shown on slips and WhatsApp invoices with &quot;Prepared by Vaypar&quot; footer.
                  </Text>
                </View>
              </View>
            </ScrollView>
          ) : messages.length === 0 ? (
            /* ===================================================================== */
            /* WELCOME / GREETING SCREEN (Exact reference image layout) */
            /* ===================================================================== */
            <ScrollView
              contentContainerStyle={styles.welcomeScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.centerContainer}>
                {/* Pro Plan / Model Pill Badge */}
                <TouchableOpacity
                  onPress={() => setShowModelModal(true)}
                  style={[styles.planBadge, { backgroundColor: '#F5EBE1', borderColor: '#E8DBCF' }]}
                  activeOpacity={0.8}
                >
                  <Text style={styles.planBadgeText}>
                    <Text style={{ fontWeight: '700', color: '#8A5D3B' }}>Vaypar AI</Text>
                    <Text style={{ color: '#A17D62' }}> · {SUPPORTED_AI_MODELS.find((m) => m.id === selectedModel)?.name || 'Qwen 3.8 27B'}</Text>
                  </Text>
                </TouchableOpacity>

                {/* Big Elegant Headline */}
                <Text style={[styles.greetingTitle, { color: theme.text }]}>
                  {greeting}
                </Text>

                {/* Floating Centered Input Box (Matching reference) */}
                <View
                  style={[
                    styles.floatingInputCard,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                      shadowColor: '#000',
                    },
                  ]}
                >
                  <TextInput
                    placeholder="How can I help you today? Ask in Urdu or English..."
                    placeholderTextColor={theme.textMuted}
                    value={inputMessage}
                    onChangeText={setInputMessage}
                    onSubmitEditing={() => handleSendMessage()}
                    style={[styles.floatingTextInput, { color: theme.text }]}
                    multiline
                  />

                  {/* Input Footer Toolbar */}
                  <View style={styles.floatingInputFooter}>
                    <View style={styles.inputActionIcons}>
                      <TouchableOpacity
                        onPress={() => handleSendMessage('Give me a full stock and financial overview.')}
                        style={styles.iconCircle}
                      >
                        <Ionicons name="add" size={17} color={theme.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleSendMessage('List all low stock items.')}
                        style={styles.iconCircle}
                      >
                        <Ionicons name="cube-outline" size={16} color={theme.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleSendMessage('What are my best selling products?')}
                        style={styles.iconCircle}
                      >
                        <Ionicons name="trending-up-outline" size={16} color={theme.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleSendMessage('Which items have the highest profit margin?')}
                        style={styles.iconCircle}
                      >
                        <Ionicons name="cash-outline" size={16} color={theme.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.inputRightControls}>
                      {/* Model Selector Pill */}
                      <TouchableOpacity
                        onPress={() => setShowModelModal(true)}
                        style={[styles.modelPill, { backgroundColor: theme.background, borderColor: theme.border }]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.modelPillText, { color: theme.textSecondary }]}>
                          {SUPPORTED_AI_MODELS.find((m) => m.id === selectedModel)?.name || 'Qwen 3.8 27B'}
                        </Text>
                        <Ionicons name="chevron-down" size={12} color={theme.textMuted} style={{ marginLeft: 4 }} />
                      </TouchableOpacity>

                      {/* Send Button (Circular with arrow-up) */}
                      <TouchableOpacity
                        onPress={() => handleSendMessage()}
                        disabled={!inputMessage.trim() || isLoading}
                        style={[
                          styles.sendRoundBtn,
                          {
                            backgroundColor: inputMessage.trim() ? theme.primary : theme.border,
                          },
                        ]}
                      >
                        {isLoading ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons name="arrow-up" size={18} color={inputMessage.trim() ? '#FFFFFF' : theme.textMuted} />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Urdu / Fast Chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
                  style={{ width: '100%', marginBottom: 12 }}
                >
                  {URDU_QUICK_PROMPTS.map((item, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => handleSendMessage(item.prompt)}
                      style={[styles.quickPromptChip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text }}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* QUICK START SECTION (2x2 Grid from reference) */}
                <View style={styles.quickStartSection}>
                  <Text style={[styles.quickStartHeader, { color: theme.textMuted }]}>
                    QUICK START
                  </Text>

                  <View style={styles.quickGrid}>
                    {QUICK_STARTS.map((card) => (
                      <TouchableOpacity
                        key={card.id}
                        onPress={() => handleSendMessage(card.prompt)}
                        style={[
                          styles.quickCard,
                          {
                            backgroundColor: theme.backgroundElement,
                            borderColor: theme.border,
                          },
                        ]}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.quickCardIconWrap, { backgroundColor: card.color + '15' }]}>
                          <Ionicons name={card.icon} size={18} color={card.color} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.quickCardTitle, { color: theme.text }]}>
                            {card.title}
                          </Text>
                          <Text style={[styles.quickCardDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                            {card.desc}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>
          ) : (
            /* ===================================================================== */
            /* ACTIVE CHAT THREAD VIEW */
            /* ===================================================================== */
            <View style={{ flex: 1 }}>
              {/* Chat Thread Header */}
              <View style={[styles.chatHeaderBar, { borderBottomColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.chatTitleText, { color: theme.text }]} numberOfLines={1}>
                    {currentConversation?.title || 'Active Conversation'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 8 }}>
                    <Text style={{ fontSize: 11, color: theme.textMuted }}>
                      {businessName}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowModelModal(true)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: theme.backgroundElement,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: theme.border,
                        gap: 3,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: theme.primary }}>
                        {SUPPORTED_AI_MODELS.find((m) => m.id === selectedModel)?.name || 'Qwen 3.8 27B'}
                      </Text>
                      <Ionicons name="chevron-down" size={10} color={theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={handleStartNewChat}
                  style={[styles.smallBtn, { backgroundColor: theme.primaryLight, borderColor: theme.border }]}
                >
                  <Ionicons name="add" size={16} color={theme.text} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.text, marginLeft: 4 }}>New</Text>
                </TouchableOpacity>
              </View>

              {/* Messages Scroll Area */}
              <ScrollView
                ref={scrollViewRef}
                style={styles.chatScroll}
                contentContainerStyle={styles.chatScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {messages.map((m) => {
                  const isUser = m.role === 'user';
                  const isNotice = m.content.startsWith('⚠️');
                  return (
                    <View
                      key={m.id}
                      style={[
                        styles.messageRow,
                        isUser ? styles.userRow : styles.assistantRow,
                      ]}
                    >
                      {!isUser && (
                        <View style={[styles.aiAvatar, { backgroundColor: theme.primary }]}>
                          <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                        </View>
                      )}
                      <View
                        style={[
                          styles.messageBubble,
                          isUser
                            ? [styles.userBubble, { backgroundColor: theme.primary }]
                            : [styles.assistantBubble, { backgroundColor: theme.backgroundElement, borderColor: theme.border }],
                        ]}
                      >
                        {!isUser && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary }}>
                              Vaypar AI Co-Pilot
                            </Text>
                            <TouchableOpacity onPress={() => handleCopyText(m.content)} style={{ padding: 2 }}>
                              <Ionicons name="copy-outline" size={13} color={theme.textMuted} />
                            </TouchableOpacity>
                          </View>
                        )}
                        <Text
                          style={[
                            styles.messageText,
                            { color: isUser ? '#FFFFFF' : theme.text },
                          ]}
                          selectable
                        >
                          {m.content}
                        </Text>
                        {isNotice && (
                          <TouchableOpacity
                            onPress={() => {
                              const lastUser = [...messages].reverse().find((x) => x.role === 'user');
                              if (lastUser) handleSendMessage(lastUser.content);
                            }}
                            style={{
                              marginTop: 8,
                              backgroundColor: theme.primaryLight,
                              paddingVertical: 5,
                              paddingHorizontal: 10,
                              borderRadius: 6,
                              alignSelf: 'flex-start',
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Ionicons name="refresh-outline" size={13} color={theme.primary} />
                            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>Retry Request</Text>
                          </TouchableOpacity>
                        )}
                        <Text
                          style={[
                            styles.messageTime,
                            { color: isUser ? '#FFFFFF80' : theme.textMuted },
                          ]}
                        >
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {isLoading && (
                  <View style={[styles.messageRow, styles.assistantRow]}>
                    <View style={[styles.aiAvatar, { backgroundColor: theme.primary }]}>
                      <Ionicons name="sparkles" size={14} color="#FFFFFF" />
                    </View>
                    <View style={[styles.assistantBubble, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                        <ActivityIndicator size="small" color={theme.primary} />
                        <Text style={{ fontSize: 13, color: theme.textMuted, fontStyle: 'italic' }}>
                          Analyzing {businessName} data with {SUPPORTED_AI_MODELS.find((m) => m.id === selectedModel)?.name || 'AI'}...
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Quick Urdu / Roman Urdu chips above input */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 8, gap: 8 }}
                style={{ backgroundColor: theme.backgroundElement, borderTopWidth: 1, borderTopColor: theme.border }}
              >
                {URDU_QUICK_PROMPTS.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => handleSendMessage(item.prompt)}
                    style={[styles.quickPromptChip, { backgroundColor: theme.background, borderColor: theme.border }]}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textSecondary }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Bottom Sticky Input Bar */}
              <View style={[styles.bottomInputBar, { backgroundColor: theme.backgroundElement, borderTopColor: theme.border }]}>
                <TextInput
                  placeholder="Ask Vaypar AI in Urdu or English..."
                  placeholderTextColor={theme.textMuted}
                  value={inputMessage}
                  onChangeText={setInputMessage}
                  onSubmitEditing={() => handleSendMessage()}
                  style={[styles.bottomTextInput, { color: theme.text }]}
                  multiline
                />
                <TouchableOpacity
                  onPress={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || isLoading}
                  style={[
                    styles.sendRoundBtn,
                    {
                      backgroundColor: inputMessage.trim() ? theme.primary : theme.border,
                      marginLeft: 8,
                    },
                  ]}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="arrow-up" size={18} color={inputMessage.trim() ? '#FFFFFF' : theme.textMuted} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
      {/* Model Selection Modal */}
      <Modal
        visible={showModelModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="hardware-chip" size={20} color={theme.primary} />
                <Text style={[styles.modalTitle, { color: theme.text }]}>Select AI Engine</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModelModal(false)}>
                <Ionicons name="close" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 14 }}>
              Choose which high-speed LLM model powers your business co-pilot:
            </Text>

            {SUPPORTED_AI_MODELS.map((item) => {
              const isSelected = selectedModel === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => handleSelectModel(item.id)}
                  style={[
                    styles.modelOptionCard,
                    {
                      backgroundColor: isSelected ? theme.primaryLight : theme.background,
                      borderColor: isSelected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.modelOptionName, { color: isSelected ? theme.primary : theme.text }]}>
                        {item.name}
                      </Text>
                      <View style={[styles.tagPill, { backgroundColor: isSelected ? theme.primary : theme.backgroundElement }]}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: isSelected ? '#FFFFFF' : theme.textMuted }}>
                          {item.tag}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                      {item.desc}
                    </Text>
                  </View>
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isSelected ? theme.primary : theme.border}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* Custom API Key Configuration Modal */}
      <Modal
        visible={showKeyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowKeyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="key" size={20} color={theme.primary} />
                <Text style={[styles.modalTitle, { color: theme.text }]}>Groq AI API Key</Text>
              </View>
              <TouchableOpacity onPress={() => setShowKeyModal(false)}>
                <Ionicons name="close" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 12 }}>
              Enter your Groq Cloud API key (e.g. gsk_...) or leave default:
            </Text>

            <TextInput
              placeholder="gsk_..."
              placeholderTextColor={theme.textMuted}
              value={customKeyInput}
              onChangeText={setCustomKeyInput}
              style={[
                styles.keyInputBox,
                { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                onPress={handleTestConnection}
                disabled={testingKey}
                style={[styles.modalActionBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
              >
                {testingKey ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Ionicons name="flash-outline" size={15} color={theme.text} />
                )}
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>
                  {testingKey ? 'Testing...' : 'Test Key'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveApiKey}
                style={[styles.modalActionBtn, { backgroundColor: theme.primary, borderColor: theme.primary, flex: 1 }]}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Save Key</Text>
              </TouchableOpacity>
            </View>

            {testResult && (
              <Text style={{ fontSize: 12, marginTop: 10, color: testResult.ok ? '#16A34A' : theme.danger }}>
                {testResult.msg}
              </Text>
            )}

            <TouchableOpacity onPress={handleResetApiKey} style={{ alignSelf: 'center', marginTop: 14 }}>
              <Text style={{ fontSize: 12, color: theme.textMuted, textDecorationLine: 'underline' }}>
                Reset to default in-app key
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topWindowBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  macDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  topCenterPill: {
    flexDirection: 'row',
    borderRadius: 20,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  topTabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 14,
  },
  topTabBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitLayout: {
    flex: 1,
    flexDirection: 'row',
  },

  // Sidebar styles
  sidebar: {
    borderRightWidth: 1,
    padding: 14,
    flexDirection: 'column',
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
    marginBottom: 10,
  },
  newChatText: {
    fontSize: 14,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  quickNavSection: {
    marginBottom: 16,
    gap: 4,
  },
  quickNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 10,
  },
  quickNavText: {
    fontSize: 13,
    fontWeight: '500',
  },
  recentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  recentsTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  recentsList: {
    flex: 1,
  },
  emptyRecentsText: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 3,
  },
  recentItemTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  recentItemDate: {
    fontSize: 11,
    marginTop: 2,
  },
  deleteIconBtn: {
    padding: 4,
  },
  profileFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    marginTop: 8,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  profileName: {
    fontSize: 13,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 11,
  },

  // Main Canvas styles
  mainCanvas: {
    flex: 1,
  },
  welcomeScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  centerContainer: {
    width: '100%',
    maxWidth: 680,
    alignItems: 'center',
  },
  planBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  planBadgeText: {
    fontSize: 12,
  },
  greetingTitle: {
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 28,
    letterSpacing: -0.5,
  },

  // Floating Input Card (Reference layout)
  floatingInputCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
    marginBottom: 32,
  },
  floatingTextInput: {
    fontSize: 15,
    minHeight: 48,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  floatingInputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
  },
  inputActionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  modelPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sendRoundBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Quick Start 2x2 grid
  quickStartSection: {
    width: '100%',
  },
  quickStartHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickCard: {
    width: '48%',
    minWidth: 260,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  quickCardDesc: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },

  // Chat Thread styles
  chatHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  chatTitleText: {
    fontSize: 16,
    fontWeight: '700',
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  chatScroll: {
    flex: 1,
  },
  chatScrollContent: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 4,
    alignItems: 'flex-start',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  messageBubble: {
    maxWidth: '82%',
    padding: 12,
    borderRadius: 14,
  },
  userBubble: {
    borderBottomRightRadius: 3,
  },
  assistantBubble: {
    borderTopLeftRadius: 3,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 21,
  },
  messageTime: {
    fontSize: 10,
    marginTop: 5,
    alignSelf: 'flex-end',
  },
  bottomInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  bottomTextInput: {
    flex: 1,
    fontSize: 14,
    maxHeight: 100,
    paddingVertical: 4,
  },

  // Insights View styles
  insightsScroll: {
    padding: 24,
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statBox: {
    width: '47%',
    flexGrow: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  insightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  infoCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  quickPromptChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modelOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  modelOptionName: {
    fontSize: 14,
    fontWeight: '700',
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  keyInputBox: {
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  modalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
});
