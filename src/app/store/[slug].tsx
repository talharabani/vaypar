import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    Image,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useTheme } from '../../hooks/use-theme';
import * as sqlite from '../../services/sqlite';

const IS_WEB = Platform.OS === 'web';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(t: string) {
  return t.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
}

function fmt(n: number) {
  return `PKR ${n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

// ─── Shopify-Style Product Card ───────────────────────────────────────────────
function ProductCard({
  product,
  inCart,
  onAdd,
  onRemove,
  index,
  theme,
  isMobile,
}: {
  product: sqlite.Product;
  inCart: { product: sqlite.Product; qty: number } | undefined;
  onAdd: () => void;
  onRemove: () => void;
  index: number;
  theme: any;
  isMobile: boolean;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        delay: Math.min(index * 40, 400),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay: Math.min(index * 40, 400),
        useNativeDriver: true,
        tension: 85,
        friction: 10,
      }),
    ]).start();
  }, []);

  const isLow = product.quantity > 0 && product.quantity <= 5;
  const isOutOfStock = product.quantity <= 0;

  return (
    <Animated.View
      style={[
        styles.cardWrap,
        isMobile ? styles.cardWrapMobile : styles.cardWrapDesktop,
        { opacity: fadeAnim, transform: [{ translateY }] },
      ]}
    >
      <Pressable
        onHoverIn={() => setIsHovered(true)}
        onHoverOut={() => setIsHovered(false)}
        style={[
          styles.card,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: isHovered ? theme.primary : theme.border,
            boxShadow: isHovered
              ? '0 12px 28px -4px rgba(0,0,0,0.12), 0 4px 10px -2px rgba(0,0,0,0.06)'
              : '0 2px 8px rgba(0,0,0,0.04)',
            transform: isHovered && IS_WEB ? [{ translateY: -4 }] : undefined,
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          } as any,
        ]}
      >
        {/* Product Media Area */}
        <View style={[styles.cardImgBox, { backgroundColor: theme.backgroundSelected }]}>
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              style={[
                styles.cardImg,
                isHovered && IS_WEB ? ({ transform: [{ scale: 1.04 }], transition: 'transform 0.3s ease' } as any) : undefined,
              ]}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.cardImgFallback}>
              <Ionicons name="cube-outline" size={36} color={theme.textMuted} />
            </View>
          )}

          {/* Badges Overlays */}
          <View style={styles.badgeTopRow}>
            {product.category ? (
              <View style={[styles.categoryTag, { backgroundColor: theme.backgroundElement + 'E6', borderColor: theme.border }]}>
                <Text style={[styles.categoryTagText, { color: theme.textSecondary }]} numberOfLines={1}>
                  {product.category}
                </Text>
              </View>
            ) : <View />}

            {/* Stock indicator badge */}
            <View
              style={[
                styles.stockPill,
                {
                  backgroundColor: isOutOfStock
                    ? '#EF444418'
                    : isLow
                    ? '#F59E0B18'
                    : '#10B98118',
                  borderColor: isOutOfStock
                    ? '#EF444440'
                    : isLow
                    ? '#F59E0B40'
                    : '#10B98140',
                },
              ]}
            >
              <View
                style={[
                  styles.stockDot,
                  {
                    backgroundColor: isOutOfStock
                      ? '#EF4444'
                      : isLow
                      ? '#F59E0B'
                      : '#10B981',
                  },
                ]}
              />
              <Text
                style={[
                  styles.stockText,
                  {
                    color: isOutOfStock
                      ? '#EF4444'
                      : isLow
                      ? '#F59E0B'
                      : '#10B981',
                  },
                ]}
              >
                {isOutOfStock ? 'Sold Out' : isLow ? `${product.quantity} left` : 'In Stock'}
              </Text>
            </View>
          </View>
        </View>

        {/* Card Body */}
        <View style={styles.cardBody}>
          <Text style={[styles.cardName, { color: theme.text }]} numberOfLines={2}>
            {product.name}
          </Text>

          {product.description ? (
            <Text style={[styles.cardDesc, { color: theme.textSecondary }]} numberOfLines={1}>
              {product.description}
            </Text>
          ) : null}

          <View style={styles.cardPriceRow}>
            <View>
              <Text style={[styles.cardPriceLabel, { color: theme.textMuted }]}>Price</Text>
              <Text style={[styles.cardPrice, { color: theme.primary }]}>
                {fmt(product.price)}
                {product.unit ? <Text style={{ fontSize: 11, fontWeight: '500', color: theme.textSecondary }}> / {product.unit}</Text> : null}
              </Text>
            </View>

            {/* Cart Quick Add / Stepper */}
            {inCart ? (
              <View style={[styles.qtyRow, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                <TouchableOpacity onPress={onRemove} style={styles.qtyMinus} activeOpacity={0.7}>
                  <Ionicons name="remove" size={14} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.qtyNum, { color: theme.text }]}>{inCart.qty}</Text>
                <TouchableOpacity onPress={onAdd} style={[styles.qtyPlus, { backgroundColor: theme.primary }]} activeOpacity={0.7}>
                  <Ionicons name="add" size={14} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={onAdd}
                disabled={isOutOfStock}
                style={[
                  styles.addBtn,
                  {
                    backgroundColor: isOutOfStock ? theme.backgroundSelected : theme.primary,
                    opacity: isOutOfStock ? 0.6 : 1,
                  },
                ]}
                activeOpacity={0.85}
              >
                <Ionicons name="cart-outline" size={14} color={isOutOfStock ? theme.textMuted : '#FFFFFF'} />
                <Text style={[styles.addBtnText, { color: isOutOfStock ? theme.textMuted : '#FFFFFF' }]}>
                  {isOutOfStock ? 'Out' : 'Add'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Shopify-Style Slide Cart Sheet ───────────────────────────────────────────
function CartSheet({
  visible,
  cart,
  onClose,
  onAdd,
  onRemove,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  onSendOrder,
  theme,
  isMobile,
}: {
  visible: boolean;
  cart: { product: sqlite.Product; qty: number }[];
  onClose: () => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  onSendOrder: () => void;
  theme: any;
  isMobile: boolean;
}) {
  const slideAnim = useRef(new Animated.Value(600)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 600, duration: 250, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const total = cart.reduce((s, c) => s + c.product.price * c.qty, 0);
  const count = cart.reduce((s, c) => s + c.qty, 0);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropAnim }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Slide-over Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          !isMobile && styles.sheetDesktop,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            transform: [{ translateY: slideAnim }],
          },
        ]}
        pointerEvents="auto"
      >
        <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />

        {/* Header */}
        <View style={styles.sheetHeaderRow}>
          <View>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Shopping Bag</Text>
            <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
              {count} {count === 1 ? 'item' : 'items'} in your cart
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.sheetClose, { backgroundColor: theme.backgroundSelected }]}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>

        {/* Free Shipping / Express Notice */}
        <View style={[styles.freeShippingBanner, { backgroundColor: theme.primaryLight, borderColor: theme.primary + '30' }]}>
          <Ionicons name="flash-outline" size={15} color={theme.primary} />
          <Text style={[styles.freeShippingText, { color: theme.text }]}>
            Direct WhatsApp Dispatch with Instant Confirmation
          </Text>
        </View>

        {/* Cart Item Rows */}
        <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
          {cart.map(({ product, qty }) => (
            <View key={product.id} style={[styles.sheetItem, { borderBottomColor: theme.border + '60' }]}>
              <View style={[styles.sheetItemThumb, { backgroundColor: theme.backgroundSelected }]}>
                {product.imageUrl ? (
                  <Image source={{ uri: product.imageUrl }} style={styles.sheetThumbImg} resizeMode="cover" />
                ) : (
                  <Ionicons name="cube-outline" size={18} color={theme.textSecondary} />
                )}
              </View>

              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.sheetItemName, { color: theme.text }]} numberOfLines={1}>
                  {product.name}
                </Text>
                <Text style={[styles.sheetItemPrice, { color: theme.textSecondary }]}>
                  {fmt(product.price)} each
                </Text>
              </View>

              <View style={[styles.sheetQtyRow, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                <TouchableOpacity onPress={() => onRemove(product.id)} style={styles.sheetQtyBtn}>
                  <Ionicons name="remove" size={12} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.sheetQtyNum, { color: theme.text }]}>{qty}</Text>
                <TouchableOpacity onPress={() => onAdd(product.id)} style={[styles.sheetQtyBtn, { backgroundColor: theme.primary }]}>
                  <Ionicons name="add" size={12} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <Text style={[styles.sheetItemTotal, { color: theme.text }]}>
                {fmt(product.price * qty)}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Price Breakdown */}
        <View style={[styles.priceBreakdownBox, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
          <View style={styles.priceRow}>
            <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>Subtotal</Text>
            <Text style={[styles.priceVal, { color: theme.text }]}>{fmt(total)}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={[styles.priceLabel, { color: theme.textSecondary }]}>Delivery Fee</Text>
            <Text style={[styles.priceVal, { color: theme.success, fontWeight: '700' }]}>Confirmed on WhatsApp</Text>
          </View>
          <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.totalLabel, { color: theme.text }]}>Estimated Total</Text>
            <Text style={[styles.totalValue, { color: theme.primary }]}>{fmt(total)}</Text>
          </View>
        </View>

        {/* Customer Checkout Form */}
        <Text style={[styles.inputGroupTitle, { color: theme.text }]}>Customer Details</Text>
        <View style={styles.sheetInputRow}>
          <View style={[styles.sheetInput, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Ionicons name="person-outline" size={15} color={theme.textSecondary} />
            <TextInput
              style={[styles.sheetInputText, { color: theme.text }]}
              placeholder="Your Full Name *"
              placeholderTextColor={theme.textMuted}
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>

          <View style={[styles.sheetInput, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Ionicons name="call-outline" size={15} color={theme.textSecondary} />
            <TextInput
              style={[styles.sheetInputText, { color: theme.text }]}
              placeholder="Mobile Number (e.g. 0300...)*"
              placeholderTextColor={theme.textMuted}
              value={customerPhone}
              onChangeText={setCustomerPhone}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* Order Via WhatsApp Action */}
        <TouchableOpacity onPress={onSendOrder} style={styles.waBtn} activeOpacity={0.88}>
          <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
          <Text style={styles.waBtnText}>Place Order via WhatsApp</Text>
        </TouchableOpacity>
        <Text style={[styles.guaranteeNote, { color: theme.textMuted }]}>
          Direct merchant communication · Fast delivery · No hidden charges
        </Text>
      </Animated.View>
    </View>
  );
}

// ─── Main Public Store Page ───────────────────────────────────────────────────
export default function PublicStorePage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [business, setBusiness] = useState<sqlite.BusinessProfile | null>(null);
  const [products, setProducts] = useState<sqlite.Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState<{ product: sqlite.Product; qty: number }[]>([]);
  const [cartVisible, setCartVisible] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderSent, setOrderSent] = useState(false);

  // Pulse animation for loader
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        // Fast path: localStorage snapshot
        if (typeof window !== 'undefined' && window.localStorage) {
          const bizId = window.localStorage.getItem(`vaypar_slug_${slug}`);
          if (bizId) {
            const raw = window.localStorage.getItem(`vaypar_store_${bizId}`);
            if (raw) {
              const snap = JSON.parse(raw) as { business: sqlite.BusinessProfile; products: sqlite.Product[] };
              if (snap.business && Array.isArray(snap.products) && !cancelled) {
                setBusiness(snap.business);
                setProducts(snap.products);
                setLoading(false);
                return;
              }
            }
          }
        }
        // SQLite fallback
        const dbTimeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
        await Promise.race([sqlite.getDB(), dbTimeout]);
        const allBiz = await sqlite.getAllBusinessProfiles();
        const matched = allBiz.find(b => slugify(b.businessName) === slug);
        if (!matched) { if (!cancelled) setNotFound(true); return; }
        const prods = await sqlite.getProducts(matched.id);
        if (!cancelled) {
          setBusiness(matched);
          setProducts(prods.filter(p => p.quantity > 0));
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || 'General').filter(Boolean));
    return ['All', ...Array.from(cats)];
  }, [products]);

  const filtered = useMemo(() => products.filter(p => {
    const query = search.trim().toLowerCase();
    const ms = !query || p.name.toLowerCase().includes(query) || (p.description || '').toLowerCase().includes(query) || (p.category || '').toLowerCase().includes(query);
    const mc = activeCategory === 'All' || (p.category || 'General') === activeCategory;
    return ms && mc;
  }), [products, search, activeCategory]);

  const addToCart = (product: sqlite.Product) =>
    setCart(prev => {
      const ex = prev.find(c => c.product.id === product.id);
      return ex ? prev.map(c => c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c)
                : [...prev, { product, qty: 1 }];
    });

  const addById = (id: string) => {
    const p = products.find(x => x.id === id);
    if (p) addToCart(p);
  };

  const removeFromCart = (productId: string) =>
    setCart(prev => {
      const ex = prev.find(c => c.product.id === productId);
      if (ex && ex.qty > 1) return prev.map(c => c.product.id === productId ? { ...c, qty: c.qty - 1 } : c);
      return prev.filter(c => c.product.id !== productId);
    });

  const cartTotal = cart.reduce((s, c) => s + c.product.price * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  const handleSendOrder = () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      if (IS_WEB) {
        window.alert('Please enter your full name and phone number to place the order.');
      } else {
        Alert.alert('Required Information', 'Please enter your name and phone number.');
      }
      return;
    }
    if (!cart.length) {
      if (IS_WEB) window.alert('Your cart is empty.');
      else Alert.alert('Cart Empty', 'Please add items to your cart.');
      return;
    }

    const lines = cart.map(c => `• ${c.product.name} x${c.qty} = ${fmt(c.product.price * c.qty)}`).join('\n');
    const msg = `*New Order from ${customerName.trim()}*\nPhone: ${customerPhone.trim()}\n\n*Items Ordered:*\n${lines}\n\n*Estimated Total: ${fmt(cartTotal)}*\n\nOrder placed via ${business?.businessName} Online Storefront.`;
    const ph = (business?.phone || '').replace(/\D/g, '');
    const url = ph ? `https://wa.me/${ph.startsWith('92') ? ph : '92' + ph}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    
    if (IS_WEB) window.open(url, '_blank'); else Linking.openURL(url);
    setOrderSent(true);
    setCart([]);
    setCartVisible(false);
  };

  // ── Loading Screen ──
  if (loading) {
    return (
      <View style={[styles.loadScreen, { backgroundColor: theme.background }]}>
        <Animated.View style={[styles.loadLogo, { backgroundColor: theme.primaryLight, opacity: pulse }]}>
          <Ionicons name="storefront-outline" size={44} color={theme.primary} />
        </Animated.View>
        <Text style={[styles.loadText, { color: theme.text }]}>Preparing Storefront…</Text>
        <View style={styles.loadDots}>
          {[0, 1, 2].map(i => (
            <Animated.View key={i} style={[styles.loadDot, { backgroundColor: theme.primary, opacity: pulse }]} />
          ))}
        </View>
      </View>
    );
  }

  // ── Store Not Found ──
  if (notFound || !business) {
    return (
      <View style={[styles.loadScreen, { backgroundColor: theme.background }]}>
        <View style={[styles.notFoundIcon, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="storefront-outline" size={42} color={theme.textSecondary} />
        </View>
        <Text style={[styles.notFoundTitle, { color: theme.text }]}>Storefront Offline</Text>
        <Text style={[styles.notFoundSub, { color: theme.textSecondary }]}>
          The store you are looking for is currently updating or offline.
        </Text>
        <TouchableOpacity
          onPress={() => { setLoading(true); setNotFound(false); }}
          style={[styles.retryBtn, { backgroundColor: theme.primary }]}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={16} color="#FFFFFF" />
          <Text style={styles.retryBtnText}>Refresh Catalog</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* ── Top Shopify Announcement Bar ── */}
      <View style={[styles.announcementBar, { backgroundColor: theme.primary }]}>
        <View style={styles.announcementContent}>
          <Ionicons name="sparkles" size={12} color="#FFFFFF" />
          <Text style={styles.announcementText}>
            Direct Storefront · Verified Merchant · Fast WhatsApp Delivery
          </Text>
        </View>
      </View>

      {/* ── Shopify Sticky Header ── */}
      <View style={[styles.header, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
        <View style={styles.headerContainer}>
          <View style={styles.headerLeft}>
            {business.logoUri ? (
              <Image source={{ uri: business.logoUri }} style={styles.headerLogo} />
            ) : (
              <View style={[styles.headerLogoFallback, { backgroundColor: theme.primary }]}>
                <Text style={styles.headerLogoLetter}>{business.businessName[0].toUpperCase()}</Text>
              </View>
            )}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[styles.headerStoreName, { color: theme.text }]} numberOfLines={1}>
                  {business.businessName}
                </Text>
                <Ionicons name="checkmark-circle" size={15} color="#10B981" />
              </View>
              <Text style={[styles.headerStoreStatus, { color: theme.textSecondary }]}>
                Official Catalog · {products.length} Products
              </Text>
            </View>
          </View>

          {/* Right Header: Cart Trigger */}
          <TouchableOpacity
            onPress={() => setCartVisible(true)}
            style={[
              styles.headerCartBtn,
              {
                backgroundColor: cartCount > 0 ? theme.primary : theme.backgroundSelected,
                borderColor: theme.border,
              },
            ]}
            activeOpacity={0.85}
          >
            <Ionicons name="bag-handle-outline" size={17} color={cartCount > 0 ? '#FFFFFF' : theme.text} />
            <Text style={[styles.headerCartText, { color: cartCount > 0 ? '#FFFFFF' : theme.text }]}>
              {cartCount > 0 ? fmt(cartTotal) : 'Bag'}
            </Text>
            {cartCount > 0 && (
              <View style={styles.headerCartBadge}>
                <Text style={styles.headerCartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Main Scrollable Storefront ── */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Universal Static Hero Banner (Perfect for ALL Businesses) ── */}
        <View style={[styles.heroBanner, { backgroundColor: theme.heroCard || theme.backgroundElement, borderBottomColor: theme.border }]}>
          <View style={styles.heroInner}>
            <View style={[styles.heroPill, { backgroundColor: '#10B98118', borderColor: '#10B98135' }]}>
              <View style={[styles.heroPillDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.heroPillText, { color: '#10B981' }]}>
                Verified Business Storefront
              </Text>
            </View>

            <Text style={[styles.heroTitle, { color: theme.text }]}>
              Discover Quality Products & Exclusive Deals
            </Text>

            <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
              Browse through our live catalog with clear pricing. Select items and place your order directly via WhatsApp for quick confirmation and dispatch.
            </Text>

            {/* 4 Pillars Trust Bar */}
            <View style={styles.trustGrid}>
              <View style={[styles.trustCard, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={theme.primary} />
                <View>
                  <Text style={[styles.trustTitle, { color: theme.text }]}>Guaranteed Quality</Text>
                  <Text style={[styles.trustSub, { color: theme.textMuted }]}>100% Genuine Items</Text>
                </View>
              </View>

              <View style={[styles.trustCard, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                <Ionicons name="flash-outline" size={18} color={theme.primary} />
                <View>
                  <Text style={[styles.trustTitle, { color: theme.text }]}>Fast Dispatch</Text>
                  <Text style={[styles.trustSub, { color: theme.textMuted }]}>Direct Store Shipping</Text>
                </View>
              </View>

              <View style={[styles.trustCard, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                <Ionicons name="pricetag-outline" size={18} color={theme.primary} />
                <View>
                  <Text style={[styles.trustTitle, { color: theme.text }]}>Direct Pricing</Text>
                  <Text style={[styles.trustSub, { color: theme.textMuted }]}>Zero Middleman Markup</Text>
                </View>
              </View>

              <View style={[styles.trustCard, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                <View>
                  <Text style={[styles.trustTitle, { color: theme.text }]}>Instant Support</Text>
                  <Text style={[styles.trustSub, { color: theme.textMuted }]}>Live WhatsApp Help</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── Search & Filter Bar ── */}
        <View style={styles.controlsContainer}>
          <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search by product name, category, or code…"
              placeholderTextColor={theme.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Category Chips Bar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            {categories.map(cat => {
              const isActive = activeCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setActiveCategory(cat)}
                  style={[
                    styles.catPill,
                    {
                      backgroundColor: isActive ? theme.primary : theme.backgroundElement,
                      borderColor: isActive ? theme.primary : theme.border,
                    },
                  ]}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.catPillText,
                      {
                        color: isActive ? '#FFFFFF' : theme.textSecondary,
                        fontWeight: isActive ? '700' : '500',
                      },
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Catalog Section Header */}
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionHeading, { color: theme.text }]}>
                {activeCategory === 'All' ? 'All Products' : activeCategory}
              </Text>
              <Text style={[styles.sectionSub, { color: theme.textSecondary }]}>
                Showing {filtered.length} {filtered.length === 1 ? 'item' : 'items'} available for order
              </Text>
            </View>

            {business.phone ? (
              <TouchableOpacity
                onPress={() => {
                  const ph = (business.phone || '').replace(/\D/g, '');
                  const url = `https://wa.me/${ph.startsWith('92') ? ph : '92' + ph}`;
                  if (IS_WEB) window.open(url, '_blank'); else Linking.openURL(url);
                }}
                style={[styles.contactStoreBtn, { backgroundColor: '#25D36618', borderColor: '#25D36640' }]}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-whatsapp" size={14} color="#25D366" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#16A34A' }}>Contact Store</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* ── Products Grid ── */}
        <View style={styles.gridContainer}>
          {filtered.length === 0 ? (
            <View style={[styles.emptyStateCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Ionicons name="search-outline" size={48} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No products found</Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                Try adjusting your search query or selecting a different category.
              </Text>
              {search.length > 0 && (
                <TouchableOpacity
                  onPress={() => { setSearch(''); setActiveCategory('All'); }}
                  style={[styles.clearFilterBtn, { backgroundColor: theme.primaryLight, borderColor: theme.primary + '30' }]}
                >
                  <Text style={[styles.clearFilterText, { color: theme.primary }]}>Clear All Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.grid}>
              {filtered.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  inCart={cart.find(c => c.product.id === product.id)}
                  onAdd={() => addToCart(product)}
                  onRemove={() => removeFromCart(product.id)}
                  index={i}
                  theme={theme}
                  isMobile={isMobile}
                />
              ))}
            </View>
          )}
        </View>

        {/* Order Success Toast / Banner */}
        {orderSent && (
          <View style={[styles.orderSuccessBanner, { backgroundColor: '#10B98118', borderColor: '#10B98150' }]}>
            <Ionicons name="checkmark-circle" size={24} color="#10B981" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#10B981' }}>Order Message Sent!</Text>
              <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                Your order details were redirected to WhatsApp. The store will confirm order delivery shortly.
              </Text>
            </View>
          </View>
        )}

        {/* ── Storefront Footer ── */}
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Text style={[styles.footerStoreName, { color: theme.text }]}>
            {business.businessName}
          </Text>
          {business.address ? (
            <Text style={[styles.footerAddress, { color: theme.textSecondary }]}>
              {business.address}
            </Text>
          ) : null}
          <Text style={[styles.footerPowered, { color: theme.textMuted }]}>
            Powered by <Text style={{ color: theme.primary, fontWeight: '800' }}>Vaypar Cloud POS</Text>
          </Text>
        </View>
      </ScrollView>

      {/* ── Floating Mobile / Desktop Quick Bag Bar ── */}
      {cartCount > 0 && !cartVisible && (
        <TouchableOpacity
          onPress={() => setCartVisible(true)}
          style={[styles.floatCartBtn, { backgroundColor: theme.primary }]}
          activeOpacity={0.92}
        >
          <View style={styles.floatCartBadge}>
            <Text style={styles.floatCartBadgeText}>{cartCount}</Text>
          </View>
          <Text style={styles.floatCartText}>
            View Bag · {fmt(cartTotal)}
          </Text>
          <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* ── Cart Slide-over Drawer ── */}
      <CartSheet
        visible={cartVisible}
        cart={cart}
        onClose={() => setCartVisible(false)}
        onAdd={addById}
        onRemove={removeFromCart}
        customerName={customerName}
        setCustomerName={setCustomerName}
        customerPhone={customerPhone}
        setCustomerPhone={setCustomerPhone}
        onSendOrder={handleSendOrder}
        theme={theme}
        isMobile={isMobile}
      />
    </View>
  );
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Loading
  loadScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadLogo: {
    width: 84,
    height: 84,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadText: {
    fontSize: 15,
    fontWeight: '700',
  },
  loadDots: {
    flexDirection: 'row',
    gap: 6,
  },
  loadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  // Not Found
  notFoundIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  notFoundSub: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },

  // Announcement Bar
  announcementBar: {
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  announcementContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  announcementText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Sticky Header
  header: {
    borderBottomWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  headerContainer: {
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  headerLogoFallback: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogoLetter: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  headerStoreName: {
    fontSize: 16,
    fontWeight: '800',
    maxWidth: 220,
  },
  headerStoreStatus: {
    fontSize: 11,
    marginTop: 1,
  },
  headerCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  headerCartText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  headerCartBadge: {
    backgroundColor: '#FFFFFF',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCartBadgeText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '900',
  },

  // Universal Static Hero Banner
  heroBanner: {
    borderBottomWidth: 1,
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  heroInner: {
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
  },
  heroPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontSize: IS_WEB ? 32 : 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 13.5,
    lineHeight: 22,
    maxWidth: 680,
    marginBottom: 24,
  },
  trustGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  trustCard: {
    flex: 1,
    minWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  trustTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  trustSub: {
    fontSize: 10.5,
    marginTop: 1,
  },

  // Search & Controls
  controlsContainer: {
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
  },
  categoryScroll: {
    gap: 8,
    paddingBottom: 12,
  },
  catPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  catPillText: {
    fontSize: 12.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  contactStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },

  // Grid
  gridContainer: {
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
    paddingHorizontal: 16,
    marginTop: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  cardWrap: {
    flexGrow: 0,
    flexShrink: 0,
  },
  cardWrapMobile: {
    width: '48%',
  },
  cardWrapDesktop: {
    width: 230,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardImgBox: {
    height: 155,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cardImg: {
    width: '100%',
    height: '100%',
  },
  cardImgFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTopRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryTag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: 100,
  },
  categoryTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  stockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  stockDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  stockText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  cardBody: {
    padding: 12,
    gap: 4,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    minHeight: 36,
  },
  cardDesc: {
    fontSize: 11,
    marginTop: -2,
    marginBottom: 4,
  },
  cardPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  cardPriceLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardPrice: {
    fontSize: 14.5,
    fontWeight: '900',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  qtyMinus: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  qtyNum: {
    fontSize: 12.5,
    fontWeight: '800',
    paddingHorizontal: 4,
    minWidth: 18,
    textAlign: 'center',
  },
  qtyPlus: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },

  // Empty State
  emptyStateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    width: '100%',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptySub: {
    fontSize: 12.5,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  clearFilterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Success Banner
  orderSuccessBanner: {
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
    marginVertical: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  // Footer
  footer: {
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
    borderTopWidth: 1,
    marginTop: 40,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
  },
  footerStoreName: {
    fontSize: 15,
    fontWeight: '800',
  },
  footerAddress: {
    fontSize: 12,
    textAlign: 'center',
  },
  footerPowered: {
    fontSize: 11,
    marginTop: 8,
  },

  // Float Cart
  floatCartBtn: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    maxWidth: 500,
    marginHorizontal: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    boxShadow: '0 10px 30px -5px rgba(0,0,0,0.3)',
    elevation: 8,
  },
  floatCartBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  floatCartBadgeText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '900',
  },
  floatCartText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // Cart Sheet
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 200,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 201,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    padding: 20,
    paddingBottom: 36,
    boxShadow: '0 -10px 40px rgba(0,0,0,0.25)',
    elevation: 20,
  },
  sheetDesktop: {
    maxWidth: 480,
    left: 'auto',
    right: 20,
    bottom: 20,
    borderRadius: 24,
    borderWidth: 1,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  sheetSubtitle: {
    fontSize: 11.5,
    marginTop: 1,
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freeShippingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  freeShippingText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  sheetItemThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  sheetThumbImg: {
    width: '100%',
    height: '100%',
  },
  sheetItemName: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  sheetItemPrice: {
    fontSize: 11,
    marginTop: 2,
  },
  sheetQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 10,
  },
  sheetQtyBtn: {
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  sheetQtyNum: {
    fontSize: 12,
    fontWeight: '800',
    minWidth: 18,
    textAlign: 'center',
  },
  sheetItemTotal: {
    fontSize: 12.5,
    fontWeight: '800',
    minWidth: 70,
    textAlign: 'right',
  },
  priceBreakdownBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 10,
    marginBottom: 14,
    gap: 6,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 11.5,
  },
  priceVal: {
    fontSize: 12,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 2,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  totalValue: {
    fontSize: 17,
    fontWeight: '900',
  },
  inputGroupTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    marginBottom: 8,
  },
  sheetInputRow: {
    gap: 8,
    marginBottom: 14,
  },
  sheetInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  sheetInputText: {
    flex: 1,
    fontSize: 12.5,
  },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 14,
    boxShadow: '0 4px 14px rgba(37,211,102,0.3)',
  },
  waBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  guaranteeNote: {
    fontSize: 10.5,
    textAlign: 'center',
    marginTop: 8,
  },
});
