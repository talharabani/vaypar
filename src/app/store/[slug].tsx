import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
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
    View,
} from 'react-native';
import * as sqlite from '../../services/sqlite';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_WEB = Platform.OS === 'web';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function slugify(t: string) {
  return t.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
}
function fmt(n: number) {
  return `PKR ${n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:        '#0D1117',
  surface:   '#161B22',
  surface2:  '#21262D',
  border:    '#30363D',
  primary:   '#00D9C5',
  primaryDim:'#00D9C520',
  accent:    '#A78BFA',
  accentDim: '#A78BFA20',
  green:     '#3FB950',
  orange:    '#F78166',
  text:      '#F0F6FC',
  textSec:   '#8B949E',
  textMuted: '#484F58',
  white:     '#FFFFFF',
  wa:        '#25D366',
};

// ─── Animated product card ────────────────────────────────────────────────────
function ProductCard({
  product,
  inCart,
  onAdd,
  onRemove,
  index,
}: {
  product: sqlite.Product;
  inCart: { product: sqlite.Product; qty: number } | undefined;
  onAdd: () => void;
  onRemove: () => void;
  index: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay: index * 60,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
    ]).start();
  }, []);

  const handlePressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const handlePressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50 }).start();

  const isLow = product.quantity <= 5;

  return (
    <Animated.View
      style={[
        styles.cardWrap,
        { opacity: fadeAnim, transform: [{ translateY }, { scale: scaleAnim }] },
      ]}
    >
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.card}
      >
        {/* Image / placeholder */}
        <View style={styles.cardImgBox}>
          {product.imageUrl ? (
            <Image source={{ uri: product.imageUrl }} style={styles.cardImg} resizeMode="cover" />
          ) : (
            <View style={styles.cardImgFallback}>
              <Ionicons name="cube-outline" size={32} color={C.primary} />
            </View>
          )}
          {/* Stock badge overlay */}
          <View style={[styles.stockPill, { backgroundColor: isLow ? C.orange + '22' : C.green + '22' }]}>
            <View style={[styles.stockDot, { backgroundColor: isLow ? C.orange : C.green }]} />
            <Text style={[styles.stockText, { color: isLow ? C.orange : C.green }]}>
              {isLow ? `${product.quantity} left` : 'In Stock'}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={2}>{product.name}</Text>
          {product.category ? (
            <Text style={styles.cardCat}>{product.category}</Text>
          ) : null}
          <Text style={styles.cardPrice}>{fmt(product.price)}</Text>

          {/* Cart controls */}
          {inCart ? (
            <View style={styles.qtyRow}>
              <TouchableOpacity onPress={onRemove} style={styles.qtyMinus}>
                <Ionicons name="remove" size={16} color={C.text} />
              </TouchableOpacity>
              <Text style={styles.qtyNum}>{inCart.qty}</Text>
              <TouchableOpacity onPress={onAdd} style={styles.qtyPlus}>
                <Ionicons name="add" size={16} color={C.bg} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={onAdd} style={styles.addBtn} activeOpacity={0.8}>
              <Ionicons name="add" size={15} color={C.bg} />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Animated cart bottom sheet ───────────────────────────────────────────────
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
}) {
  const slideAnim = useRef(new Animated.Value(600)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 12 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 600, duration: 280, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const total = cart.reduce((s, c) => s + c.product.price * c.qty, 0);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropAnim }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        pointerEvents="auto"
      >
        {/* Handle */}
        <View style={styles.sheetHandle} />

        <View style={styles.sheetHeaderRow}>
          <Text style={styles.sheetTitle}>Your Order</Text>
          <TouchableOpacity onPress={onClose} style={styles.sheetClose}>
            <Ionicons name="close" size={20} color={C.textSec} />
          </TouchableOpacity>
        </View>

        {/* Items */}
        <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
          {cart.map(({ product, qty }) => (
            <View key={product.id} style={styles.sheetItem}>
              <View style={styles.sheetItemIcon}>
                <Ionicons name="cube-outline" size={18} color={C.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetItemName} numberOfLines={1}>{product.name}</Text>
                <Text style={styles.sheetItemPrice}>{fmt(product.price)}</Text>
              </View>
              <View style={styles.sheetQtyRow}>
                <TouchableOpacity onPress={() => onRemove(product.id)} style={styles.sheetQtyBtn}>
                  <Ionicons name="remove" size={14} color={C.text} />
                </TouchableOpacity>
                <Text style={styles.sheetQtyNum}>{qty}</Text>
                <TouchableOpacity onPress={() => onAdd(product.id)} style={[styles.sheetQtyBtn, { backgroundColor: C.primary }]}>
                  <Ionicons name="add" size={14} color={C.bg} />
                </TouchableOpacity>
              </View>
              <Text style={styles.sheetItemTotal}>{fmt(product.price * qty)}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Total */}
        <View style={styles.sheetTotalRow}>
          <Text style={styles.sheetTotalLabel}>Total</Text>
          <Text style={styles.sheetTotalValue}>{fmt(total)}</Text>
        </View>

        {/* Customer inputs */}
        <View style={styles.sheetInputRow}>
          <View style={[styles.sheetInput, { flex: 1 }]}>
            <Ionicons name="person-outline" size={15} color={C.textSec} />
            <TextInput
              style={styles.sheetInputText}
              placeholder="Your Name *"
              placeholderTextColor={C.textMuted}
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>
          <View style={[styles.sheetInput, { flex: 1 }]}>
            <Ionicons name="call-outline" size={15} color={C.textSec} />
            <TextInput
              style={styles.sheetInputText}
              placeholder="Phone *"
              placeholderTextColor={C.textMuted}
              value={customerPhone}
              onChangeText={setCustomerPhone}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* Send button */}
        <TouchableOpacity onPress={onSendOrder} style={styles.waBtn} activeOpacity={0.85}>
          <Ionicons name="logo-whatsapp" size={20} color={C.white} />
          <Text style={styles.waBtnText}>Send Order via WhatsApp</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function PublicStorePage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

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

  // Header scroll fade
  const scrollY = useRef(new Animated.Value(0)).current;
  const navBg = scrollY.interpolate({ inputRange: [0, 80], outputRange: ['rgba(13,17,23,0)', 'rgba(13,17,23,0.98)'], extrapolate: 'clamp' });

  // Pulse animation for loading dots
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
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
        // Slow path: SQLite (only when main tab is closed)
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
    const cats = new Set(products.map(p => p.category || 'General'));
    return ['All', ...Array.from(cats)];
  }, [products]);

  const filtered = useMemo(() => products.filter(p => {
    const ms = p.name.toLowerCase().includes(search.toLowerCase()) || (p.description || '').toLowerCase().includes(search.toLowerCase());
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
    if (!customerName.trim() || !customerPhone.trim()) { alert('Please enter your name and phone number.'); return; }
    if (!cart.length) { alert('Your cart is empty.'); return; }
    const lines = cart.map(c => `• ${c.product.name} x${c.qty} = ${fmt(c.product.price * c.qty)}`).join('\n');
    const msg = `*New Order from ${customerName.trim()}*\n📞 ${customerPhone.trim()}\n\n*Items:*\n${lines}\n\n💰 *Total: ${fmt(cartTotal)}*\n\nOrder placed via ${business?.businessName} online store.`;
    const ph = (business?.phone || '').replace(/\D/g, '');
    const url = ph ? `https://wa.me/${ph.startsWith('92') ? ph : '92' + ph}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    if (IS_WEB) window.open(url, '_blank'); else Linking.openURL(url);
    setOrderSent(true); setCart([]); setCartVisible(false);
  };

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadScreen}>
        <Animated.View style={[styles.loadLogo, { opacity: pulse }]}>
          <Ionicons name="storefront" size={48} color={C.primary} />
        </Animated.View>
        <Text style={styles.loadText}>Loading store…</Text>
        <View style={styles.loadDots}>
          {[0, 1, 2].map(i => (
            <Animated.View key={i} style={[styles.loadDot, { opacity: pulse, transform: [{ scale: pulse }] }]} />
          ))}
        </View>
      </View>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────────────
  if (notFound || !business) {
    return (
      <View style={styles.loadScreen}>
        <View style={styles.notFoundIcon}>
          <Ionicons name="storefront-outline" size={40} color={C.primary} />
        </View>
        <Text style={styles.notFoundTitle}>Store Not Found</Text>
        <Text style={styles.notFoundSub}>
          Open the main app, log in, then refresh this page.
        </Text>
        <TouchableOpacity onPress={() => { setLoading(true); setNotFound(false); }} style={styles.retryBtn}>
          <Ionicons name="refresh" size={16} color={C.bg} />
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>

      {/* ── Sticky Nav (fades in on scroll) ────────────────────────────────── */}
      <Animated.View style={[styles.nav, { backgroundColor: navBg as any }]}>
        <View style={styles.navLeft}>
          {business.logoUri ? (
            <Image source={{ uri: business.logoUri }} style={styles.navLogo} />
          ) : (
            <View style={styles.navLogoFb}>
              <Text style={styles.navLogoLetter}>{business.businessName[0].toUpperCase()}</Text>
            </View>
          )}
          <View>
            <Text style={styles.navName} numberOfLines={1}>{business.businessName}</Text>
            <Text style={styles.navSub}>{products.length} products</Text>
          </View>
        </View>

        <TouchableOpacity onPress={() => setCartVisible(true)} style={styles.navCartBtn} activeOpacity={0.85}>
          <Ionicons name="bag-outline" size={18} color={cartCount > 0 ? C.bg : C.textSec} />
          {cartCount > 0 && (
            <>
              <Text style={styles.navCartTotal}>{fmt(cartTotal)}</Text>
              <View style={styles.navCartBadge}>
                <Text style={styles.navCartBadgeText}>{cartCount}</Text>
              </View>
            </>
          )}
        </TouchableOpacity>
      </Animated.View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroGradientTop} />
          <View style={styles.heroContent}>
            <View style={styles.heroBadge}>
              <View style={styles.heroBadgeDot} />
              <Text style={styles.heroBadgeText}>Online Store</Text>
            </View>
            <Text style={styles.heroTitle}>{business.businessName}</Text>
            <Text style={styles.heroSub}>Browse & order via WhatsApp — fast delivery</Text>
            {business.address ? (
              <View style={styles.heroAddr}>
                <Ionicons name="location-outline" size={13} color={C.textSec} />
                <Text style={styles.heroAddrText}>{business.address}</Text>
              </View>
            ) : null}

            {/* Stats row */}
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>{products.length}</Text>
                <Text style={styles.heroStatLbl}>Products</Text>
              </View>
              <View style={styles.heroStatDiv} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>{categories.length - 1 || 1}</Text>
                <Text style={styles.heroStatLbl}>Categories</Text>
              </View>
              <View style={styles.heroStatDiv} />
              <View style={styles.heroStat}>
                <Ionicons name="logo-whatsapp" size={16} color={C.wa} />
                <Text style={[styles.heroStatLbl, { color: C.wa, marginTop: 2 }]}>WhatsApp</Text>
              </View>
            </View>
          </View>
          <View style={styles.heroGradientBottom} />
        </View>

        {/* ── Search ────────────────────────────────────────────────────────── */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color={C.textSec} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search products…"
              placeholderTextColor={C.textMuted}
              value={search}
              onChangeText={setSearch}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={C.textSec} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* ── Category pills ────────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catScroll}>
          {categories.map(cat => {
            const active = activeCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setActiveCategory(cat)}
                style={[styles.catPill, active && styles.catPillActive]}
                activeOpacity={0.75}
              >
                <Text style={[styles.catPillText, active && styles.catPillTextActive]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Section heading ───────────────────────────────────────────────── */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>
            {activeCategory === 'All' ? 'All Products' : activeCategory}
          </Text>
          <Text style={styles.sectionCount}>{filtered.length} items</Text>
        </View>

        {/* ── Products grid ─────────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={44} color={C.textMuted} />
            <Text style={styles.emptyText}>No products found</Text>
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
              />
            ))}
          </View>
        )}

        {/* ── Order success ─────────────────────────────────────────────────── */}
        {orderSent && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={22} color={C.green} />
            <Text style={styles.successText}>Order sent to WhatsApp! We'll confirm shortly.</Text>
          </View>
        )}

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          {business.phone ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${business.phone}`)}
              style={styles.footerPhone}
            >
              <Ionicons name="call-outline" size={14} color={C.primary} />
              <Text style={styles.footerPhoneText}>{business.phone}</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.footerPowered}>
            Powered by <Text style={{ color: C.primary, fontWeight: '800' }}>Vaypar POS</Text>
          </Text>
        </View>
      </Animated.ScrollView>

      {/* ── Floating cart bubble ──────────────────────────────────────────────── */}
      {cartCount > 0 && !cartVisible && (
        <TouchableOpacity onPress={() => setCartVisible(true)} style={styles.floatCart} activeOpacity={0.9}>
          <Ionicons name="bag-outline" size={20} color={C.bg} />
          <Text style={styles.floatCartText}>{cartCount} item{cartCount > 1 ? 's' : ''} · {fmt(cartTotal)}</Text>
          <Ionicons name="chevron-up" size={15} color={C.bg} />
        </TouchableOpacity>
      )}

      {/* ── Cart sheet ────────────────────────────────────────────────────────── */}
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
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CARD_W = IS_WEB ? 220 : (SCREEN_W - 48) / 2;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Loading
  loadScreen: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadLogo: { width: 80, height: 80, borderRadius: 20, backgroundColor: C.primaryDim, alignItems: 'center', justifyContent: 'center' },
  loadText: { color: C.textSec, fontSize: 14, fontWeight: '600' },
  loadDots: { flexDirection: 'row', gap: 6 },
  loadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.primary },

  // Not found
  notFoundIcon: { width: 80, height: 80, borderRadius: 20, backgroundColor: C.primaryDim, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  notFoundTitle: { color: C.text, fontSize: 20, fontWeight: '800', marginTop: 4 },
  notFoundSub: { color: C.textSec, fontSize: 13, textAlign: 'center', paddingHorizontal: 40, marginTop: 6, lineHeight: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryBtnText: { color: C.bg, fontWeight: '800', fontSize: 14 },

  // Nav
  nav: {
    position: IS_WEB ? ('sticky' as any) : 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingTop: IS_WEB ? 12 : 44,
  },
  navLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  navLogo: { width: 36, height: 36, borderRadius: 10 },
  navLogoFb: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  navLogoLetter: { color: C.bg, fontWeight: '900', fontSize: 16 },
  navName: { color: C.text, fontWeight: '800', fontSize: 15, maxWidth: 180 },
  navSub: { color: C.textSec, fontSize: 10, marginTop: 1 },
  navCartBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  navCartTotal: { color: C.text, fontWeight: '700', fontSize: 13 },
  navCartBadge: { backgroundColor: C.primary, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  navCartBadgeText: { color: C.bg, fontSize: 9, fontWeight: '900' },

  // Hero
  hero: { height: 340, backgroundColor: C.surface, overflow: 'hidden' },
  heroGradientTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 180, backgroundColor: C.primary, opacity: 0.07 },
  heroGradientBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, backgroundColor: C.bg },
  heroContent: { paddingHorizontal: 24, paddingTop: IS_WEB ? 60 : 90, paddingBottom: 40 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  heroBadgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.primary },
  heroBadgeText: { color: C.primary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  heroTitle: { color: C.text, fontSize: IS_WEB ? 36 : 28, fontWeight: '900', lineHeight: IS_WEB ? 44 : 34, marginBottom: 8 },
  heroSub: { color: C.textSec, fontSize: 14, lineHeight: 20, marginBottom: 10 },
  heroAddr: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 20 },
  heroAddrText: { color: C.textSec, fontSize: 12 },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  heroStat: { alignItems: 'center' },
  heroStatVal: { color: C.text, fontSize: 18, fontWeight: '900' },
  heroStatLbl: { color: C.textSec, fontSize: 11, marginTop: 2 },
  heroStatDiv: { width: 1, height: 28, backgroundColor: C.border },

  // Search
  searchWrap: { paddingHorizontal: 20, paddingVertical: 16 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 14 },

  // Categories
  catScroll: { paddingHorizontal: 20, gap: 8, paddingBottom: 4 },
  catPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  catPillActive: { backgroundColor: C.primary, borderColor: C.primary },
  catPillText: { color: C.textSec, fontSize: 13, fontWeight: '600' },
  catPillTextActive: { color: C.bg, fontWeight: '800' },

  // Section
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 20, marginBottom: 12 },
  sectionTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  sectionCount: { color: C.textSec, fontSize: 12, fontWeight: '600', backgroundColor: C.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: C.border },

  // Grid & cards
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, gap: 12,
    ...(IS_WEB ? { justifyContent: 'flex-start' } : {}),
  },
  cardWrap: { width: CARD_W },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
    ...(IS_WEB ? { boxShadow: '0 4px 24px rgba(0,0,0,0.3)' } as any : { elevation: 4, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8 }),
  },
  cardImgBox: { height: 140, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  cardImgFallback: { alignItems: 'center', justifyContent: 'center' },
  cardImg: { width: '100%', height: '100%' },
  stockPill: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  stockDot: { width: 5, height: 5, borderRadius: 3 },
  stockText: { fontSize: 9, fontWeight: '800' },
  cardBody: { padding: 12, gap: 4 },
  cardName: { color: C.text, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  cardCat: { color: C.textMuted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardPrice: { color: C.primary, fontSize: 15, fontWeight: '900', marginTop: 2, marginBottom: 8 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  qtyMinus: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  qtyNum: { color: C.text, fontWeight: '800', fontSize: 14, minWidth: 20, textAlign: 'center' },
  qtyPlus: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignSelf: 'flex-start' },
  addBtnText: { color: C.bg, fontWeight: '800', fontSize: 12 },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { color: C.textSec, fontSize: 14 },

  // Success
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 20, padding: 16, borderRadius: 14, backgroundColor: C.green + '15', borderWidth: 1, borderColor: C.green + '40' },
  successText: { color: C.green, fontWeight: '700', fontSize: 13, flex: 1 },

  // Footer
  footer: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  footerDivider: { width: 40, height: 1, backgroundColor: C.border, marginBottom: 8 },
  footerPhone: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primaryDim, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  footerPhoneText: { color: C.primary, fontWeight: '700', fontSize: 13 },
  footerPowered: { color: C.textMuted, fontSize: 11 },

  // Float cart
  floatCart: {
    position: 'absolute', bottom: 24, left: 20, right: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.primary, borderRadius: 16, padding: 16,
    ...(IS_WEB ? { boxShadow: '0 8px 32px rgba(0,217,197,0.35)' } as any : { elevation: 10, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 16 }),
  },
  floatCartText: { color: C.bg, fontWeight: '800', fontSize: 14, flex: 1, textAlign: 'center' },

  // Cart sheet
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200 },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 201,
    backgroundColor: C.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, paddingBottom: 40,
    borderTopWidth: 1, borderColor: C.border,
    ...(IS_WEB ? { boxShadow: '0 -8px 40px rgba(0,0,0,0.5)' } as any : { elevation: 20 }),
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: '900' },
  sheetClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  sheetItemIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryDim, alignItems: 'center', justifyContent: 'center' },
  sheetItemName: { color: C.text, fontWeight: '700', fontSize: 13 },
  sheetItemPrice: { color: C.textSec, fontSize: 12 },
  sheetQtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetQtyBtn: { width: 26, height: 26, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  sheetQtyNum: { color: C.text, fontWeight: '800', fontSize: 13, minWidth: 18, textAlign: 'center' },
  sheetItemTotal: { color: C.primary, fontWeight: '800', fontSize: 13, minWidth: 72, textAlign: 'right' },
  sheetTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.border, marginTop: 4 },
  sheetTotalLabel: { color: C.textSec, fontWeight: '700', fontSize: 14 },
  sheetTotalValue: { color: C.primary, fontWeight: '900', fontSize: 22 },
  sheetInputRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  sheetInput: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  sheetInputText: { flex: 1, color: C.text, fontSize: 13 },
  waBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.wa, borderRadius: 14, paddingVertical: 15 },
  waBtnText: { color: C.white, fontWeight: '900', fontSize: 15 },
});
