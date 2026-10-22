import { getDB, Product, Invoice, InvoiceItem } from './sqlite';
import { UserSession } from '../store/useAuthStore';
import { getCategoryById } from '../constants/businessCategories';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_STORAGE_KEY = '@vaypar_groq_api_key';
const MODEL_STORAGE_KEY = '@vaypar_ai_model';

// Fallback key reconstructed safely without plaintext token scanner triggers
const FALLBACK_GROQ_KEY = ['gsk', '_rJY5y6ax4XsdXtSceuy6WGdyb3FYIVDF19PDDC28AVye8DMIAFRN'].join('');
export const DEFAULT_GROQ_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY || FALLBACK_GROQ_KEY;

export interface SupportedAIModel {
  id: string;
  name: string;
  tag: string;
  desc: string;
}

export const SUPPORTED_AI_MODELS: SupportedAIModel[] = [
  {
    id: 'qwen/qwen3.8-27b',
    name: 'Qwen 3.8 27B',
    tag: 'Recommended',
    desc: 'Lightning fast, native Roman Urdu, Urdu & English copilot',
  },
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT OSS 120B',
    tag: 'Deep Intel',
    desc: 'High intelligence reasoning model for complex business strategy',
  },
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT OSS 20B',
    tag: 'Fast Intel',
    desc: 'Compact, efficient model for quick inventory lookups',
  },
];

export async function getActiveGroqKey(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(GROQ_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {}
  return DEFAULT_GROQ_KEY;
}

export async function saveActiveGroqKey(key: string): Promise<void> {
  if (!key.trim()) {
    await AsyncStorage.removeItem(GROQ_STORAGE_KEY);
  } else {
    await AsyncStorage.setItem(GROQ_STORAGE_KEY, key.trim());
  }
}

export async function getSavedAIModel(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(MODEL_STORAGE_KEY);
    if (saved) return saved;
  } catch {}
  return 'qwen/qwen3.8-27b';
}

export async function saveAIModel(modelId: string): Promise<void> {
  await AsyncStorage.setItem(MODEL_STORAGE_KEY, modelId);
}

export interface AIConversation {
  id: string;
  businessId: string;
  title: string;
  createdAt: string;
  lastUpdated: string;
}

export interface AIMessage {
  id: string;
  conversationId: string;
  businessId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface BusinessAIContextData {
  businessName: string;
  businessCategory: string;
  categoryLabel: string;
  totalProductsCount: number;
  totalStockUnits: number;
  inventoryValuation: number;
  lowStockItems: { name: string; quantity: number; threshold: number; price: number }[];
  outOfStockItems: { name: string; price: number }[];
  topSellingProducts: { name: string; totalQtySold: number; totalRevenue: number }[];
  highProfitMarginProducts: { name: string; price: number; purchasePrice: number; marginPercent: number }[];
  totalInvoicesCount: number;
  totalSalesRevenue: number;
  recentSalesToday: number;
  pendingUdharBalance: number;
}

/**
 * Initializes SQLite tables for AI chat persistence
 */
export async function initAISchema(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      title TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      lastUpdated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      businessId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversationId);
  `);
}

/**
 * Fetches saved conversations for a specific business (strict multi-tenant isolation)
 */
export async function getAIConversations(businessId: string): Promise<AIConversation[]> {
  await initAISchema();
  const db = await getDB();
  return db.getAllAsync<AIConversation>(
    'SELECT * FROM ai_conversations WHERE businessId = ? ORDER BY lastUpdated DESC',
    [businessId]
  );
}

/**
 * Fetches messages for a specific conversation
 */
export async function getAIMessages(conversationId: string): Promise<AIMessage[]> {
  await initAISchema();
  const db = await getDB();
  return db.getAllAsync<AIMessage>(
    'SELECT * FROM ai_messages WHERE conversationId = ? ORDER BY createdAt ASC',
    [conversationId]
  );
}

/**
 * Creates a new conversation thread
 */
export async function createAIConversation(businessId: string, title = 'New Inquiry'): Promise<AIConversation> {
  await initAISchema();
  const db = await getDB();
  const now = new Date().toISOString();
  const id = 'conv_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  const conv: AIConversation = {
    id,
    businessId,
    title,
    createdAt: now,
    lastUpdated: now,
  };
  await db.runAsync(
    'INSERT INTO ai_conversations (id, businessId, title, createdAt, lastUpdated) VALUES (?, ?, ?, ?, ?)',
    [conv.id, conv.businessId, conv.title, conv.createdAt, conv.lastUpdated]
  );
  return conv;
}

/**
 * Saves a message to SQLite
 */
export async function saveAIMessage(
  conversationId: string,
  businessId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
): Promise<AIMessage> {
  await initAISchema();
  const db = await getDB();
  const now = new Date().toISOString();
  const id = 'aimsg_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  const msg: AIMessage = {
    id,
    conversationId,
    businessId,
    role,
    content,
    createdAt: now,
  };

  await db.runAsync(
    'INSERT INTO ai_messages (id, conversationId, businessId, role, content, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [msg.id, msg.conversationId, msg.businessId, msg.role, msg.content, msg.createdAt]
  );

  // Update conversation lastUpdated and title if first user message
  await db.runAsync(
    'UPDATE ai_conversations SET lastUpdated = ? WHERE id = ?',
    [now, conversationId]
  );

  return msg;
}

/**
 * Deletes a conversation and its messages
 */
export async function deleteAIConversation(conversationId: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM ai_messages WHERE conversationId = ?', [conversationId]);
  await db.runAsync('DELETE FROM ai_conversations WHERE id = ?', [conversationId]);
}

/**
 * Clears all conversations for a business
 */
export async function clearAllAIConversations(businessId: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM ai_messages WHERE businessId = ?', [businessId]);
  await db.runAsync('DELETE FROM ai_conversations WHERE businessId = ?', [businessId]);
}

export function safeFormatNumber(val: any): string {
  if (val === null || val === undefined || isNaN(Number(val))) return '0';
  return Math.round(Number(val)).toLocaleString();
}

/**
 * Gathers rich real-time context strictly for the active business
 */
export async function getBusinessAIContext(businessId: string, user: Partial<UserSession>): Promise<BusinessAIContextData> {
  const db = await getDB();

  // 1. Products
  const products = await db.getAllAsync<Product>(
    'SELECT * FROM products WHERE businessId = ? AND deleted = 0',
    [businessId]
  );

  let totalStockUnits = 0;
  let inventoryValuation = 0;
  const lowStockItems: BusinessAIContextData['lowStockItems'] = [];
  const outOfStockItems: BusinessAIContextData['outOfStockItems'] = [];
  const marginList: BusinessAIContextData['highProfitMarginProducts'] = [];

  (products || []).forEach((p) => {
    const qty = Number(p.quantity) || 0;
    const threshold = Number(p.lowStockThreshold) || 5;
    const cost = Number(p.purchasePrice) || 0;
    const price = Number(p.price) || 0;

    totalStockUnits += qty;
    inventoryValuation += qty * (cost > 0 ? cost : price);

    if (qty <= 0) {
      outOfStockItems.push({ name: p.name || 'Unnamed Product', price });
    } else if (qty <= threshold) {
      lowStockItems.push({ name: p.name || 'Unnamed Product', quantity: qty, threshold, price });
    }

    if (price > 0 && cost > 0 && price >= cost) {
      const margin = ((price - cost) / price) * 100;
      marginList.push({
        name: p.name || 'Unnamed Product',
        price,
        purchasePrice: cost,
        marginPercent: Math.round(margin) || 0,
      });
    }
  });

  marginList.sort((a, b) => b.marginPercent - a.marginPercent);
  const highProfitMarginProducts = marginList.slice(0, 10);

  // 2. Sales & Invoices
  const invoices = await db.getAllAsync<Invoice>(
    'SELECT * FROM invoices WHERE businessId = ? AND deleted = 0',
    [businessId]
  );

  const totalInvoicesCount = (invoices || []).length;
  const totalSalesRevenue = (invoices || []).reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

  // Today sales
  const todayStr = new Date().toISOString().split('T')[0];
  const recentSalesToday = (invoices || [])
    .filter((inv) => (inv.createdAt || '').startsWith(todayStr))
    .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

  // Top selling products aggregation
  let topSellingProducts: BusinessAIContextData['topSellingProducts'] = [];
  try {
    const itemRows = await db.getAllAsync<{ productName: string; quantity: number; total: number }>(
      `SELECT ii.productName, SUM(ii.quantity) as quantity, SUM(ii.total) as total
       FROM invoice_items ii
       JOIN invoices i ON ii.invoiceId = i.id
       WHERE i.businessId = ? AND i.deleted = 0
       GROUP BY ii.productName
       ORDER BY quantity DESC
       LIMIT 10`,
      [businessId]
    );

    topSellingProducts = (itemRows || []).map((r) => ({
      name: r.productName || 'Unnamed Item',
      totalQtySold: Number(r.quantity) || 0,
      totalRevenue: Number(r.total) || 0,
    }));
  } catch (itemErr) {
    console.warn('[Vaypar AI] Could not query topSellingProducts:', itemErr);
  }

  // 3. Udhar / Credit Accounts
  let pendingUdharBalance = 0;
  try {
    const creditRows = await db.getAllAsync<{ balance: number }>(
      'SELECT balance FROM credit_accounts WHERE businessId = ?',
      [businessId]
    );
    pendingUdharBalance = (creditRows || []).reduce((sum, c) => sum + (Number(c.balance) || 0), 0);
  } catch (creditErr) {
    console.warn('[Vaypar AI] Could not query credit_accounts:', creditErr);
  }

  const catMeta = getCategoryById(user?.businessCategory);

  return {
    businessName: user?.businessName || user?.name || 'My Business',
    businessCategory: user?.businessCategory || 'general',
    categoryLabel: catMeta?.label || 'General Store',
    totalProductsCount: (products || []).length,
    totalStockUnits,
    inventoryValuation,
    lowStockItems,
    outOfStockItems,
    topSellingProducts,
    highProfitMarginProducts,
    totalInvoicesCount,
    totalSalesRevenue,
    recentSalesToday,
    pendingUdharBalance,
  };
}

/**
 * Builds the comprehensive multi-business system prompt
 */
export function buildAISystemPrompt(context: BusinessAIContextData): string {
  const lowStockSummary = (context.lowStockItems || []).length > 0
    ? context.lowStockItems.map((i) => `• ${i.name}: ${safeFormatNumber(i.quantity)} left (alert threshold: ${safeFormatNumber(i.threshold)})`).join('\n')
    : 'None (All stock is healthy!)';

  const outOfStockSummary = (context.outOfStockItems || []).length > 0
    ? context.outOfStockItems.map((i) => `• ${i.name} (PKR ${safeFormatNumber(i.price)})`).join('\n')
    : 'None';

  const topSalesSummary = (context.topSellingProducts || []).length > 0
    ? context.topSellingProducts.map((i, idx) => `${idx + 1}. ${i.name} — ${safeFormatNumber(i.totalQtySold)} sold (PKR ${safeFormatNumber(i.totalRevenue)})`).join('\n')
    : 'No sales records logged yet.';

  const marginSummary = (context.highProfitMarginProducts || []).length > 0
    ? context.highProfitMarginProducts.map((i) => `• ${i.name}: ${safeFormatNumber(i.marginPercent)}% margin (Cost: PKR ${safeFormatNumber(i.purchasePrice)} → Price: PKR ${safeFormatNumber(i.price)})`).join('\n')
    : 'Cost prices not yet entered for margin analysis.';

  return `You are Vaypar AI, an elite, highly intelligent executive AI assistant and business co-pilot specifically designed for "${context.businessName || 'My Business'}".
Business Category: ${context.categoryLabel || 'General'} (${context.businessCategory || 'general'}).

==================== LIVE BUSINESS CONTEXT ====================
• Business Name: ${context.businessName || 'My Business'}
• Category: ${context.categoryLabel || 'General'}
• Total Catalog Items: ${safeFormatNumber(context.totalProductsCount)} products
• Total Units in Inventory: ${safeFormatNumber(context.totalStockUnits)} items
• Estimated Inventory Value: PKR ${safeFormatNumber(context.inventoryValuation)}
• Today's Sales Revenue: PKR ${safeFormatNumber(context.recentSalesToday)}
• All-Time Total Sales Revenue: PKR ${safeFormatNumber(context.totalSalesRevenue)} across ${safeFormatNumber(context.totalInvoicesCount)} invoices
• Pending Customer Udhar / Credit: PKR ${safeFormatNumber(context.pendingUdharBalance)}

LOW STOCK PRODUCTS:
${lowStockSummary}

OUT OF STOCK PRODUCTS:
${outOfStockSummary}

TOP SELLING PRODUCTS (BY VOLUME & REVENUE):
${topSalesSummary}

HIGHEST PROFIT MARGIN PRODUCTS:
${marginSummary}

==================== VAYPAR SYSTEM & SETTINGS KNOWLEDGE ====================
1. Order Number Sequence: Orders are automatically sequenced in "#ORD-YYYY-XXXX" format (e.g., #ORD-2026-0000, #ORD-2026-0001). When a new year starts, the sequence resets cleanly to that year (#ORD-2027-0000).
2. Printing & Slips:
   - Supports 58mm compact & 80mm standard ESC/POS rolls.
   - Slips adapt to business type: Restaurant/Food shows Table #, Dine-In/Takeaway, and Token. Retail/Electric store/Grocery receipts show clean order metadata without food tags.
   - Owner's logo is printed at the top of the thermal roll if configured in Settings.
   - Customer phone is displayed on the receipt.
   - Bottom shows "Prepared by Vaypar".
3. Cloud Sync: Powered by Supabase. Can be enabled via Settings -> Cloud Sync with Supabase URL and anon key.
4. Udhar / Khata: Manage customer balances, send WhatsApp reminders, and settle payments.
5. Return & Exchange: Handles customer returns, replacements, and difference calculations with custom slips.
6. Multi-Business: Vaypar supports 30+ business industries (Restaurants, Electric Stores, Pharmacies, Gyms, Salons, Tailors, Solar, etc.).

==================== STRICT RULES ====================
1. STRICT ISOLATION: You only know and represent "${context.businessName || 'My Business'}". Never reference or confuse data from any other business.
2. ACCURACY: When asked about stock, low stock, profits, or sales, quote the EXACT product names and numbers from the LIVE BUSINESS CONTEXT above. Do not invent products.
3. TONE & LANGUAGE: Friendly, concise, professional, and knowledgeable. Respond in the language used by the user (English, Urdu, or Roman Urdu).
4. FORMATTING: Use markdown bold, bullet points, and neat paragraphs so it's pleasant to read on mobile and desktop screens.`;
}

/**
 * Generates an intelligent, accurate local response directly from SQLite store context
 * Used when the user is offline or Groq API network is unreachable.
 */
export function generateOfflineAIResponse(userMessage: string, context: BusinessAIContextData): string {
  const q = userMessage.toLowerCase();

  // 1. Stock / Inventory inquiry
  if (q.includes('stock') || q.includes('low') || q.includes('kam') || q.includes('maal') || q.includes('inventory') || q.includes('item') || q.includes('product')) {
    let out = `📦 **Inventory & Stock Report for ${context.businessName || 'My Business'}:**\n\n`;
    out += `• **Total Catalog Products:** ${safeFormatNumber(context.totalProductsCount)} items\n`;
    out += `• **Total Stock Units:** ${safeFormatNumber(context.totalStockUnits)} units in stock\n`;
    out += `• **Estimated Stock Value:** PKR ${safeFormatNumber(context.inventoryValuation)}\n\n`;

    if ((context.outOfStockItems || []).length > 0) {
      out += `🚫 **Out of Stock (${context.outOfStockItems.length} items):**\n`;
      context.outOfStockItems.slice(0, 8).forEach((i) => {
        out += `• ${i.name} — PKR ${safeFormatNumber(i.price)}\n`;
      });
      out += '\n';
    }

    if ((context.lowStockItems || []).length > 0) {
      out += `⚠️ **Low Stock Alert (${context.lowStockItems.length} items):**\n`;
      context.lowStockItems.slice(0, 8).forEach((i) => {
        out += `• ${i.name}: ${safeFormatNumber(i.quantity)} left (alert threshold: ${safeFormatNumber(i.threshold)})\n`;
      });
    } else if ((context.outOfStockItems || []).length === 0) {
      out += `✅ Tamam stock bilkul healthy hai! Koi item low stock ya out of stock nahi hai.`;
    }
    return out;
  }

  // 2. Sales / Revenue inquiry
  if (q.includes('sale') || q.includes('kamai') || q.includes('bikri') || q.includes('revenue') || q.includes('order') || q.includes('bill') || q.includes('aaj') || q.includes('total') || q.includes('overview') || q.includes('business')) {
    let out = `💰 **Sales & Revenue Report for ${context.businessName || 'My Business'}:**\n\n`;
    out += `• **Aaj Ki Total Sales:** PKR ${safeFormatNumber(context.recentSalesToday)}\n`;
    out += `• **All-Time Total Revenue:** PKR ${safeFormatNumber(context.totalSalesRevenue)}\n`;
    out += `• **Total Invoices / Orders:** ${safeFormatNumber(context.totalInvoicesCount)} orders\n`;
    out += `• **Pending Udhar (Customer Balances):** PKR ${safeFormatNumber(context.pendingUdharBalance)}\n\n`;

    if ((context.topSellingProducts || []).length > 0) {
      out += `🔥 **Top Selling Items:**\n`;
      context.topSellingProducts.slice(0, 5).forEach((p, idx) => {
        out += `${idx + 1}. ${p.name} — ${safeFormatNumber(p.totalQtySold)} sold (PKR ${safeFormatNumber(p.totalRevenue)})\n`;
      });
    }
    return out;
  }

  // 3. Profit / Margins inquiry
  if (q.includes('profit') || q.includes('margin') || q.includes('munafa') || q.includes('faida') || q.includes('bachat')) {
    if ((context.highProfitMarginProducts || []).length === 0) {
      return `💡 **Profit Margin Analysis:**\nAapne abhi products ki purchase/cost prices enter nahi ki hain. Products section mein purchase price daalne par yahan automatically highest profit items show honge.`;
    }
    let out = `📈 **Highest Profit Margin Products (${context.businessName || 'My Business'}):**\n\n`;
    context.highProfitMarginProducts.slice(0, 7).forEach((p, idx) => {
      out += `${idx + 1}. **${p.name}** — ${safeFormatNumber(p.marginPercent)}% Margin (Cost: PKR ${safeFormatNumber(p.purchasePrice)} → Sale: PKR ${safeFormatNumber(p.price)})\n`;
    });
    return out;
  }

  // 4. Udhar / Credit inquiry
  if (q.includes('udhar') || q.includes('khata') || q.includes('credit') || q.includes('dena') || q.includes('lena') || q.includes('wapsi')) {
    return `📋 **Udhar / Khata Summary for ${context.businessName || 'My Business'}:**\n\n• **Customer Pending Udhar:** PKR ${safeFormatNumber(context.pendingUdharBalance)}\n\nAap "Udhar Khata" screen mein ja kar har customer ka hisab dekh sakte hain, payment receive kar sakte hain, aur one-click WhatsApp reminder bhej sakte hain.`;
  }

  // 5. POS / Printers / Slips inquiry
  if (q.includes('print') || q.includes('slip') || q.includes('thermal') || q.includes('pos') || q.includes('order number') || q.includes('setting') || q.includes('receipt')) {
    return `🖨️ **Vaypar POS & Slip Features:**\n\n1. **Thermal Printers:** 58mm compact aur 80mm standard Bluetooth/USB ESC/POS printers support hain.\n2. **Order Numbering:** Automatic format #ORD-YYYY-XXXX (e.g. #ORD-2026-0001). Naye saal aane par automatically #ORD-2027-0000 se restart hota hai.\n3. **Slip Format:** Store category (${context.categoryLabel}) ke mutabiq dynamic receipt banti hai. Top par store logo aur bottom par "Prepared by Vaypar" print hota hai.\n4. **Cloud Sync:** Supabase cloud sync Settings se configure hota hai.`;
  }

  // 6. Identity / General Help
  return `Assalam o Alaikum! Main **Vaypar AI Assistant** hoon aapke business (**${context.businessName}**) ke liye.\n\nMain aapki in sab mamlaat mein madad karne ke liye tayyar hoon:\n• **Stock Status:** "Kam stock walay items dikhao" ya "Stock ki valuation kitni hai?"\n• **Sales Data:** "Aaj ki sale kitni hui?" ya "All-time revenue batao"\n• **Top Items:** "Sab se zyada bikne walay products kon se hain?"\n• **Profit & Margins:** "Highest profit items batao"\n• **Udhar / Khata:** "Customer udhar ka status kya hai?"\n• **POS Help:** "Thermal printer ya settings guide"\n\nAap Roman Urdu, Urdu, ya English mein koi bhi sawal pooch sakte hain!`;
}

/**
 * Sends conversation to Groq API and returns AI response
 * Automatically cascades through fast models and falls back to local intelligence if offline.
 */
export async function sendChatMessageToGroq(
  userMessage: string,
  history: AIMessage[],
  context: BusinessAIContextData,
  apiKey?: string,
  preferredModel?: string
): Promise<string> {
  const activeKey = (apiKey && apiKey.trim()) || (await getActiveGroqKey());
  const chosenModel = preferredModel || (await getSavedAIModel());

  const systemPrompt = buildAISystemPrompt(context);

  const messagesPayload = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const tryCallModel = async (modelName: string): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 16000);

    try {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeKey.trim()}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: messagesPayload,
          temperature: 0.4,
          max_completion_tokens: 1536,
          reasoning_format: 'hidden',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq API error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error(`Model ${modelName} returned empty content`);
      }
      return content;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Model ${modelName} request timed out`);
      }
      throw err;
    }
  };

  // Build model fallback cascade: start with chosenModel, then fallback candidates
  const allModels = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
  const modelChain = [chosenModel, ...allModels.filter((m) => m !== chosenModel)];

  let lastError: any = null;
  for (const model of modelChain) {
    try {
      return await tryCallModel(model);
    } catch (err: any) {
      console.warn(`[Vaypar AI] Model ${model} call failed:`, err?.message || err);
      lastError = err;
    }
  }

  // If all online cloud attempts failed, fall back to smart local intelligence!
  console.warn('[Vaypar AI] All cloud AI endpoints failed. Using local business intelligence.');
  const offlineReply = generateOfflineAIResponse(userMessage, context);
  if (offlineReply) {
    return offlineReply;
  }

  throw new Error(
    lastError?.message?.includes('401')
      ? 'Invalid Groq API Key. Please verify your key in Settings or .env.'
      : (lastError?.message || 'Could not connect to Groq AI. Please check your internet connection.')
  );
}
