import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
    FlatList,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Alert
} from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { NotificationContainer, useToasts } from '../../components/restaurant/NotificationToast';
import { TableCard } from '../../components/restaurant/TableCard';
import ScreenWrapper from '../../components/ScreenWrapper';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../hooks/use-theme';
import { useRestaurantSync } from '../../hooks/useRestaurantSync';
import {
    addOrderItem,
    closeSession,
    createOrder,
    createTable,
    deleteTable,
    editOrderItems,
    getMenuItems,
    getOrderHistory,
    getOrderItems,
    getOrdersForSession,
    getSession,
    getTables,
    initRestaurantSchema,
    openSession,
    OrderCourse,
    OrderHistory,
    OrderItem,
    Priority,
    RestaurantMenuItem,
    RestaurantOrder,
    RestaurantTable,
    saveOrderHistory,
    sendOrderToKitchen,
    TableSession,
    updateOrderStatus,
    updateTableStatus,
} from '../../services/restaurantDb';

const LEGEND = [
  { status: 'available',       color: '#22C55E', label: 'Available' },
  { status: 'occupied',        color: '#3B82F6', label: 'Occupied' },
  { status: 'waiting_kitchen', color: '#F97316', label: 'Waiting Kitchen' },
  { status: 'food_ready',      color: '#8B5CF6', label: 'Food Ready' },
  { status: 'needs_attention', color: '#EF4444', label: 'Needs Attention' },
];

export default function TablesScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<RestaurantMenuItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Modals
  const [addTableModal, setAddTableModal] = useState(false);
  const [tableDetailModal, setTableDetailModal] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [voiceModal, setVoiceModal] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [isListening, setIsListening] = useState(false);

  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [activeSession, setActiveSession] = useState<TableSession | null>(null);
  const [sessionOrders, setSessionOrders] = useState<RestaurantOrder[]>([]);
  const [orderItemsMap, setOrderItemsMap] = useState<Record<string, OrderItem[]>>({});
  const [tableHistory, setTableHistory] = useState<OrderHistory[]>([]);

  // Add-table form
  const [newTableNum, setNewTableNum] = useState('');
  const [newCapacity, setNewCapacity] = useState('4');
  const [newPriority, setNewPriority] = useState<Priority>('normal');

  // New-order form
  const [orderCourse, setOrderCourse] = useState<OrderCourse>('main');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderPriority, setOrderPriority] = useState<Priority>('normal');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<{
    menuItem: RestaurantMenuItem;
    qty: number;
    modifiers: string;
  }[]>([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [guestCount, setGuestCount] = useState('2');

  // Timers: tableId → elapsed minutes
  const [elapsed, setElapsed] = useState<Record<string, number>>({});

  const computeElapsed = useCallback((tbls: RestaurantTable[]) => {
    const map: Record<string, number> = {};
    tbls.forEach(t => {
      if (t.seatedAt) {
        map[t.id] = Math.floor((Date.now() - new Date(t.seatedAt).getTime()) / 60000);
      }
    });
    setElapsed(map);
  }, []);

  const loadTables = useCallback(async () => {
    if (!user) return;
    const tbls = await getTables(user.businessId);
    setTables(tbls);
    computeElapsed(tbls);
  }, [user, computeElapsed]);

  const loadMenu = useCallback(async () => {
    if (!user) return;
    const items = await getMenuItems(user.businessId);
    setMenuItems(items);
  }, [user]);

  const loadAll = useCallback(async () => {
    await loadTables();
    await loadMenu();
  }, [loadTables, loadMenu]);

  useEffect(() => {
    (async () => {
      await initRestaurantSchema();
      setInitialized(true);
      await loadAll();
    })();
  }, [loadAll]);

  const syncCallback = useCallback(async () => {
    await loadAll();
    if (selectedTable?.currentSessionId) {
      const orders = await getOrdersForSession(selectedTable.currentSessionId);
      setSessionOrders(orders);
      const map: Record<string, OrderItem[]> = {};
      for (const o of orders) {
        map[o.id] = await getOrderItems(o.id);
      }
      setOrderItemsMap(map);
    }
  }, [loadAll, selectedTable]);

  useRestaurantSync(syncCallback);

  // Tick elapsed times every 30s
  useEffect(() => {
    const id = setInterval(() => computeElapsed(tables), 30000);
    return () => clearInterval(id);
  }, [tables, computeElapsed]);

  // Poll for needs_attention
  useEffect(() => {
    const id = setInterval(() => {
      tables.forEach(t => {
        if (t.status !== 'available' && (elapsed[t.id] ?? 0) >= 20 && t.status !== 'needs_attention') {
          updateTableStatus(t.id, 'needs_attention').then(loadTables);
          pushToast('table_waiting', 'Table Waiting Too Long', `${t.tableNumber} has been waiting ${elapsed[t.id]}+ minutes.`);
        }
      });
    }, 60000);
    return () => clearInterval(id);
  }, [tables, elapsed, loadTables, pushToast]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const handleAddTable = useCallback(async () => {
    if (!user || !newTableNum.trim()) return;
    await createTable(user.businessId, newTableNum.trim(), parseInt(newCapacity) || 4, newPriority);
    setAddTableModal(false);
    setNewTableNum('');
    setNewCapacity('4');
    setNewPriority('normal');
    await loadTables();
  }, [user, newTableNum, newCapacity, newPriority, loadTables]);

  async function handleSelectTable(table: RestaurantTable) {
    setSelectedTable(table);
    if (table.currentSessionId) {
      const session = await getSession(table.currentSessionId);
      setActiveSession(session);
      if (session) {
        const orders = await getOrdersForSession(session.id);
        setSessionOrders(orders);
        const map: Record<string, OrderItem[]> = {};
        for (const o of orders) {
          map[o.id] = await getOrderItems(o.id);
        }
        setOrderItemsMap(map);
      }
    } else {
      setActiveSession(null);
      setSessionOrders([]);
      setOrderItemsMap({});
    }
    const hist = await getOrderHistory(table.id, 5);
    setTableHistory(hist);
    setTableDetailModal(true);
  }

  async function handleSeatCustomers() {
    if (!selectedTable || !user) return;
    const session = await openSession(
      selectedTable.id,
      user.businessId,
      user.id,
      parseInt(guestCount) || 1
    );
    setActiveSession(session);
    setSessionOrders([]);
    setOrderItemsMap({});
    pushToast('new_order', 'Table Opened', `${selectedTable.tableNumber} — ${guestCount} guests seated.`);
    await loadTables();
  }

  async function handleCloseTable() {
    if (!selectedTable || !activeSession || !user) return;
    // Save history
    const allItems = Object.values(orderItemsMap).flat();
    await saveOrderHistory(activeSession, selectedTable.tableNumber, sessionOrders, allItems);
    const total = sessionOrders.reduce((s, o) => {
      const items = orderItemsMap[o.id] ?? [];
      return s + items.reduce((ss, i) => ss + i.price * i.quantity, 0);
    }, 0);
    await closeSession(activeSession.id, selectedTable.id, total);
    setActiveSession(null);
    setTableDetailModal(false);
    await loadTables();
  }

  async function handleSendOrder() {
    if (!selectedTable || !activeSession || !user || cartItems.length === 0) return;
    
    if (editingOrderId) {
      // Editing existing order
      const newItems = cartItems.map(c => ({
        productId: c.menuItem.productId,
        productName: c.menuItem.productName,
        price: c.menuItem.price,
        quantity: c.qty,
        kitchenStation: c.menuItem.kitchenStation,
        estimatedMinutes: c.menuItem.estimatedMinutes,
        course: orderCourse,
        modifiers: c.modifiers.split(',').map(m => m.trim()).filter(Boolean)
      }));
      await editOrderItems(editingOrderId, newItems, activeSession.id);
      pushToast('modification', 'Order Updated', `Changes sent to kitchen for ${selectedTable.tableNumber}.`);
    } else {
      // New Order
      const estMin = Math.max(...cartItems.map(c => c.menuItem.estimatedMinutes));
      const order = await createOrder(
        user.businessId, selectedTable.id, activeSession.id,
        user.id, user.name, orderCourse, orderPriority, orderNotes, estMin
      );
      for (const c of cartItems) {
        const mods = c.modifiers.split(',').map(m => m.trim()).filter(Boolean);
        await addOrderItem(
          order.id, c.menuItem.productId, c.menuItem.productName,
          c.menuItem.price, c.qty, c.menuItem.kitchenStation,
          c.menuItem.estimatedMinutes, orderCourse, mods, 'unchanged'
        );
      }
      await sendOrderToKitchen(order.id, activeSession.id);
      pushToast('new_order', 'Sent to Kitchen!', `Order for ${selectedTable.tableNumber} has been sent.`);
    }

    // Reload
    const orders = await getOrdersForSession(activeSession.id);
    setSessionOrders(orders);
    const map: Record<string, OrderItem[]> = {};
    for (const o of orders) map[o.id] = await getOrderItems(o.id);
    setOrderItemsMap(map);
    setCartItems([]);
    setOrderNotes('');
    setEditingOrderId(null);
    setOrderModal(false);
    await loadTables();
  }

  function openEditOrder(order: RestaurantOrder) {
    const items = orderItemsMap[order.id] || [];
    const editCart: { menuItem: RestaurantMenuItem; qty: number; modifiers: string; }[] = items.map(i => {
      // find menu item
      let mItem = menuItems.find(m => m.productId === i.productId);
      if (!mItem) {
        // fallback stub
        mItem = {
          id: i.productId,
          businessId: user?.businessId || '',
          productId: i.productId,
          productName: i.productName,
          price: i.price,
          kitchenStation: i.kitchenStation,
          estimatedMinutes: i.estimatedMinutes,
          course: i.course,
          isAvailable: 1,
          isFavorite: 0,
          modifiersConfig: '[]',
          category: 'General',
          lastUpdated: ''
        };
      }
      return {
        menuItem: mItem,
        qty: i.quantity,
        modifiers: (JSON.parse(i.modifiers || '[]') as string[]).join(', ')
      };
    });
    setEditingOrderId(order.id);
    setCartItems(editCart);
    setOrderCourse(order.course);
    setOrderPriority(order.priority);
    setOrderNotes(order.notes || '');
    setOrderModal(true);
  }

  async function handleMarkServed(orderId: string) {
    if (!activeSession) return;
    await updateOrderStatus(orderId, 'served', activeSession.id);
    pushToast('order_ready', 'Order Served', `Order has been marked as served.`);
    const orders = await getOrdersForSession(activeSession.id);
    setSessionOrders(orders);
    await loadTables();
  }

  async function handleRepeatOrder(order: RestaurantOrder) {
    if (!activeSession || !user) return;
    const items = orderItemsMap[order.id] || [];
    const estMin = items.length > 0 ? Math.max(...items.map(i => i.estimatedMinutes)) : 10;
    const newOrder = await createOrder(
      user.businessId, order.tableId, activeSession.id,
      user.id, user.name, order.course, order.priority, order.notes || '', estMin
    );
    for (const i of items) {
      await addOrderItem(
        newOrder.id, i.productId, i.productName, i.price, i.quantity, i.kitchenStation,
        i.estimatedMinutes, order.course, JSON.parse(i.modifiers || '[]'), 'unchanged'
      );
    }
    await sendOrderToKitchen(newOrder.id, activeSession.id);
    pushToast('new_order', 'Repeat Sent!', `Repeated order sent to kitchen.`);
    const orders = await getOrdersForSession(activeSession.id);
    setSessionOrders(orders);
    const map: Record<string, OrderItem[]> = {};
    for (const o of orders) map[o.id] = await getOrderItems(o.id);
    setOrderItemsMap(map);
    await loadTables();
  }

  async function processVoiceOrder() {
    if (!transcription.trim()) return;
    setIsListening(true);
    // Simulate AI processing delay
    await new Promise(r => setTimeout(r, 1500));
    
    // Attempt to parse table number from transcription (e.g. "Table 4 ...")
    const words = transcription.toLowerCase();
    const matchTable = tables.find(t => words.includes(t.tableNumber.toLowerCase()));
    
    const targetTable = matchTable || selectedTable;
    if (targetTable) {
      if (targetTable.currentSessionId) {
        setSelectedTable(targetTable);
        const session = await getSession(targetTable.currentSessionId);
        setActiveSession(session);
        
        // Mock AI extraction logic: find menu items mentioned
        const extracted: { menuItem: RestaurantMenuItem; qty: number; modifiers: string }[] = [];
        menuItems.forEach(mi => {
          const mName = mi.productName.toLowerCase();
          if (words.includes(mName)) {
            // Rough heuristic for quantity: if "two " + mName exists, qty=2, etc. (Just a mock)
            let qty = 1;
            if (words.includes(`two ${mName}`) || words.includes(`2 ${mName}`)) qty = 2;
            if (words.includes(`three ${mName}`) || words.includes(`3 ${mName}`)) qty = 3;
            extracted.push({ menuItem: mi, qty, modifiers: '' });
          }
        });

        if (extracted.length > 0) {
          setCartItems(extracted);
          setEditingOrderId(null);
          setOrderCourse('main');
          setOrderNotes('Via Voice Order: ' + transcription);
          setVoiceModal(false);
          setOrderModal(true);
          pushToast('modification', 'AI Order Parsed', `Found ${extracted.length} items for ${targetTable.tableNumber}`);
        } else {
          pushToast('out_of_stock', 'AI Error', 'Could not recognize any menu items.');
        }
      } else {
        pushToast('table_waiting', 'Error', `${targetTable.tableNumber} is empty. Seat customers first.`);
      }
    } else {
      pushToast('table_waiting', 'AI Error', 'Could not detect table number from speech.');
    }
    
    setIsListening(false);
    setTranscription('');
  }

  const filteredMenu = menuItems.filter(
    m => m.isAvailable === 1 && m.productName.toLowerCase().includes(menuSearch.toLowerCase())
  );

  function addToCart(item: RestaurantMenuItem) {
    setCartItems(prev => {
      const existing = prev.find(c => c.menuItem.id === item.id);
      if (existing) return prev.map(c => c.menuItem.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { menuItem: item, qty: 1, modifiers: '' }];
    });
  }

  const cartTotal = cartItems.reduce((s, c) => s + c.menuItem.price * c.qty, 0);

  if (!initialized) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: theme.textSecondary }}>Initializing Restaurant module…</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper title="Tables & Orders">
      <NotificationContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Legend */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.legend}>
        {LEGEND.map(l => (
          <View key={l.status} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: l.color }]} />
            <Text style={[styles.legendLabel, { color: theme.textSecondary }]}>{l.label}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Table grid */}
      <ScrollView
        contentContainerStyle={styles.grid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {tables.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="grid-outline" size={64} color={theme.textSecondary + '40'} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No tables set up yet.</Text>
            <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>Tap + to add your first table.</Text>
          </View>
        ) : (
          <View style={styles.tableGrid}>
            {tables.map(t => (
              <TableCard
                key={t.id}
                table={t}
                elapsedMinutes={elapsed[t.id] ?? 0}
                onPress={() => handleSelectTable(t)}
                onLongPress={() => Alert.alert('Delete Table?', `Remove ${t.tableNumber}?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteTable(t.id).then(loadTables) },
                ])}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={() => setAddTableModal(true)}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ── Add Table Modal ── */}
      <Modal visible={addTableModal} transparent animationType="slide" onRequestClose={() => setAddTableModal(false)}>
        <View style={styles.overlay}>
          <Card style={[styles.modalCard, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add New Table</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              placeholder="Table Name (e.g. Table 12)"
              placeholderTextColor={theme.textSecondary}
              value={newTableNum}
              onChangeText={setNewTableNum}
            />
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              placeholder="Capacity (seats)"
              placeholderTextColor={theme.textSecondary}
              value={newCapacity}
              onChangeText={setNewCapacity}
              keyboardType="numeric"
            />
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Priority</Text>
            <View style={styles.chipRow}>
              {(['normal', 'vip', 'express'] as Priority[]).map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setNewPriority(p)}
                  style={[styles.chip, { borderColor: theme.border, backgroundColor: newPriority === p ? theme.primary : 'transparent' }]}
                >
                  <Text style={{ color: newPriority === p ? '#FFFFFF' : theme.textSecondary, fontWeight: '700', fontSize: 13 }}>
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalBtns}>
              <Button title="Cancel" variant="ghost" size="medium" onPress={() => setAddTableModal(false)} style={{ flex: 1 }} />
              <Button title="Add Table" variant="primary" size="medium" onPress={handleAddTable} style={{ flex: 1 }} />
            </View>
          </Card>
        </View>
      </Modal>

      {/* ── Table Detail Modal ── */}
      <Modal visible={tableDetailModal} transparent animationType="slide" onRequestClose={() => setTableDetailModal(false)}>
        <View style={styles.overlay}>
          <Card style={[styles.largeModal, { backgroundColor: theme.backgroundElement }]}>
            {/* Header */}
            <View style={styles.detailHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.text }]}>{selectedTable?.tableNumber}</Text>
                <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
                  {activeSession ? `Session Open • ${activeSession.guestCount} guests • ${elapsed[selectedTable?.id ?? ''] ?? 0}m elapsed` : 'Available'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTableDetailModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Seat / close */}
              {!activeSession ? (
                <View style={{ gap: 12 }}>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
                    placeholder="Guest count"
                    placeholderTextColor={theme.textSecondary}
                    value={guestCount}
                    onChangeText={setGuestCount}
                    keyboardType="numeric"
                  />
                  <Button title="Seat Customers" variant="primary" size="large" onPress={handleSeatCustomers}
                    icon={<Ionicons name="people" size={18} color="#FFFFFF" />} />
                </View>
              ) : (
                <>
                  {/* Active orders */}
                  {sessionOrders.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      <Text style={[styles.sectionTitle, { color: theme.text }]}>Active Orders</Text>
                      {sessionOrders.map(order => {
                        const items = orderItemsMap[order.id] ?? [];
                        const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
                        return (
                          <Card key={order.id} style={[styles.orderRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
                            <View style={styles.orderRowHeader}>
                              <Text style={[{ color: theme.text, fontWeight: '700', fontSize: 13 }]}>
                                #{order.id.slice(-6).toUpperCase()} · {order.course.toUpperCase()}
                              </Text>
                              <View style={[styles.statusPill, { backgroundColor: order.status === 'ready' ? '#22C55E20' : order.status === 'preparing' ? '#F9741620' : '#6D5DF620' }]}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: order.status === 'ready' ? '#22C55E' : order.status === 'preparing' ? '#F97316' : '#6D5DF6' }}>
                                  {order.status.replace(/_/g, ' ').toUpperCase()}
                                </Text>
                              </View>
                            </View>
                            {items.map(i => (
                              <Text key={i.id} style={[{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }]}>
                                {i.quantity}× {i.productName} — PKR {(i.price * i.quantity).toFixed(2)}
                              </Text>
                            ))}
                            <Text style={[{ color: theme.primary, fontWeight: '700', marginTop: 6, fontSize: 13 }]}>
                              Subtotal: PKR {total.toFixed(2)}
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                              {(order.status === 'pending' || order.status === 'preparing') && (
                                <Button title="Edit Order" variant="secondary" size="small" onPress={() => { setTableDetailModal(false); openEditOrder(order); }} style={{ flex: 1 }} />
                              )}
                              <Button title="Repeat" variant="secondary" size="small" onPress={() => handleRepeatOrder(order)} style={{ flex: 1, backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1 }} />
                              {order.status === 'ready' && (
                                <Button title="Mark Served" variant="primary" size="small" onPress={() => handleMarkServed(order.id)} style={{ flex: 1 }} />
                              )}
                            </View>
                          </Card>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={[styles.emptyText, { color: theme.textSecondary, textAlign: 'center', marginVertical: 20 }]}>No orders yet</Text>
                  )}

                  {/* Table Timeline */}
                  {activeSession && (() => {
                    const events: { timestamp: string; event: string }[] = JSON.parse(activeSession.events || '[]');
                    return events.length > 0 ? (
                      <View style={{ marginTop: 16 }}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Table Timeline</Text>
                        {events.map((ev, i) => (
                          <View key={i} style={styles.timelineRow}>
                            <View style={[styles.timelineDot, { backgroundColor: theme.primary }]} />
                            <View style={styles.timelineContent}>
                              <Text style={[styles.timelineTime, { color: theme.textSecondary }]}>
                                {new Date(ev.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                              <Text style={[styles.timelineEvent, { color: theme.text }]}>{ev.event}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null;
                  })()}

                  {/* Buttons */}
                  <View style={[styles.modalBtns, { marginTop: 16 }]}>
                    <Button title="New Order" variant="primary" size="medium" onPress={() => setOrderModal(true)} style={{ flex: 1 }}
                      icon={<Ionicons name="add-circle" size={18} color="#FFFFFF" />} />
                    <Button title="Close Table" variant="outline" size="medium" onPress={handleCloseTable} style={{ flex: 1 }}
                      icon={<Ionicons name="log-out-outline" size={18} color={theme.primary} />} />
                  </View>
                </>
              )}

              {/* History */}
              {tableHistory.length > 0 && (
                <View style={{ marginTop: 20 }}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Order History</Text>
                  {tableHistory.map(h => (
                    <View key={h.id} style={[styles.historyRow, { borderColor: theme.border }]}>
                      <Ionicons name="time-outline" size={14} color={theme.textSecondary} />
                      <Text style={[{ color: theme.textSecondary, fontSize: 12, flex: 1 }]}>
                        {new Date(h.closedAt).toLocaleDateString('en-IN')}
                      </Text>
                      <Text style={[{ color: theme.primary, fontWeight: '700', fontSize: 13 }]}>PKR {h.totalAmount.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </Card>
        </View>
      </Modal>

      {/* ── New Order Modal ── */}
      <Modal visible={orderModal} transparent animationType="slide" onRequestClose={() => setOrderModal(false)}>
        <View style={styles.overlay}>
          <Card style={[styles.largeModal, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.detailHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingOrderId ? 'Edit Order' : 'New Order'} — {selectedTable?.tableNumber}
              </Text>
              <TouchableOpacity onPress={() => setOrderModal(false)}>
                <Ionicons name="close" size={24} color={theme.text} />
              </TouchableOpacity>
            </View>

            {/* Course */}
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Course</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {(['starter', 'main', 'dessert', 'drinks'] as OrderCourse[]).map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setOrderCourse(c)}
                  style={[styles.chip, { borderColor: theme.border, backgroundColor: orderCourse === c ? theme.primary : 'transparent', marginRight: 8 }]}
                >
                  <Text style={{ color: orderCourse === c ? '#FFFFFF' : theme.textSecondary, fontWeight: '700', fontSize: 13, textTransform: 'capitalize' }}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Priority */}
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Priority</Text>
            <View style={[styles.chipRow, { marginBottom: 12 }]}>
              {(['normal', 'vip', 'express'] as Priority[]).map(p => (
                <TouchableOpacity key={p} onPress={() => setOrderPriority(p)}
                  style={[styles.chip, { borderColor: theme.border, backgroundColor: orderPriority === p ? theme.primary : 'transparent' }]}
                >
                  <Text style={{ color: orderPriority === p ? '#FFFFFF' : theme.textSecondary, fontWeight: '700', fontSize: 13 }}>{p.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Menu search */}
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              placeholder="🔍  Search menu..."
              placeholderTextColor={theme.textSecondary}
              value={menuSearch}
              onChangeText={setMenuSearch}
            />

            {menuItems.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textSecondary, textAlign: 'center', marginVertical: 12 }]}>
                No menu items configured. Go to Restaurant → Menu to set them up.
              </Text>
            ) : (
              <FlatList
                data={filteredMenu}
                keyExtractor={i => i.id}
                style={{ maxHeight: 200, marginBottom: 8 }}
                renderItem={({ item }) => {
                  const inCart = cartItems.find(c => c.menuItem.id === item.id);
                  return (
                    <TouchableOpacity
                      onPress={() => addToCart(item)}
                      style={[styles.menuRow, { borderColor: theme.border, backgroundColor: inCart ? theme.primary + '10' : 'transparent' }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[{ color: theme.text, fontWeight: '700', fontSize: 13 }]}>{item.productName}</Text>
                        <Text style={[{ color: theme.textSecondary, fontSize: 11 }]}>{item.kitchenStation} · {item.estimatedMinutes}min</Text>
                      </View>
                      <Text style={[{ color: theme.primary, fontWeight: '700', fontSize: 14 }]}>PKR {item.price.toFixed(2)}</Text>
                      {inCart ? (
                        <View style={[styles.qtyBadge, { backgroundColor: theme.primary }]}>
                          <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>{inCart.qty}</Text>
                        </View>
                      ) : (
                        <Ionicons name="add-circle" size={22} color={theme.primary} />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            {/* Cart */}
            {cartItems.length > 0 && (
              <View style={[styles.cartBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>Cart ({cartItems.length} items) · PKR {cartTotal.toFixed(2)}</Text>
                {cartItems.map(c => (
                  <View key={c.menuItem.id} style={styles.cartRow}>
                    <Text style={[{ color: theme.text, flex: 1, fontSize: 13 }]}>{c.qty}× {c.menuItem.productName}</Text>
                    <TouchableOpacity onPress={() => setCartItems(p => p.filter(x => x.menuItem.id !== c.menuItem.id))}>
                      <Ionicons name="trash-outline" size={16} color={theme.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, marginTop: 8 }]}
              placeholder="Special notes / instructions..."
              placeholderTextColor={theme.textSecondary}
              value={orderNotes}
              onChangeText={setOrderNotes}
            />

            <View style={[styles.modalBtns, { marginTop: 12 }]}>
              <Button title="Cancel" variant="ghost" size="medium" onPress={() => setOrderModal(false)} style={{ flex: 1 }} />
              <Button
                title={editingOrderId ? "Update Order" : "Send to Kitchen"}
                variant="primary"
                size="medium"
                onPress={handleSendOrder}
                style={{ flex: 1 }}
                icon={<Ionicons name="send" size={16} color="#FFFFFF" />}
                disabled={cartItems.length === 0} />
            </View>
          </Card>
        </View>
      </Modal>

      {/* ── AI Voice Order Modal ── */}
      <Modal visible={voiceModal} transparent animationType="fade" onRequestClose={() => setVoiceModal(false)}>
        <View style={styles.overlay}>
          <Card style={[{ backgroundColor: theme.backgroundElement, width: 340, padding: 24, alignItems: 'center' }]}>
            <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="sparkles" size={20} color="#8B5CF6" />
                <Text style={[{ color: theme.text, fontSize: 18, fontWeight: '700' }]}>AI Voice Order</Text>
              </View>
              <TouchableOpacity onPress={() => setVoiceModal(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              activeOpacity={0.8}
              style={{
                width: 80, height: 80, borderRadius: 40,
                backgroundColor: isListening ? '#8B5CF6' : theme.background,
                borderWidth: isListening ? 0 : 1,
                borderColor: theme.border,
                alignItems: 'center', justifyContent: 'center',
                marginVertical: 16,
                shadowColor: '#8B5CF6', shadowOpacity: isListening ? 0.4 : 0, shadowRadius: 15, elevation: isListening ? 10 : 0
              }}
            >
              <Ionicons name="mic" size={40} color={isListening ? '#FFFFFF' : theme.textSecondary} />
            </TouchableOpacity>

            <TextInput
              style={[styles.input, { width: '100%', backgroundColor: theme.background, color: theme.text, borderColor: theme.border, minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="e.g. Table 4 needs two pizzas and one coke..."
              placeholderTextColor={theme.textSecondary}
              value={transcription}
              onChangeText={setTranscription}
              multiline
            />
            <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 8, marginBottom: 16, textAlign: 'center' }}>
              Simulate Voice-to-Text translation by typing out the order.
            </Text>

            <Button
              title={isListening ? "Processing..." : "Process with AI"}
              variant="primary" size="large"
              onPress={processVoiceOrder}
              disabled={isListening || !transcription.trim()}
              style={{ width: '100%' }}
              icon={!isListening && <Ionicons name="analytics" size={18} color="#FFFFFF" />}
            />
          </Card>
        </View>
      </Modal>

      {/* Floating Action Button for Voice Order */}
      <TouchableOpacity 
        style={[styles.voiceFab, { backgroundColor: '#8B5CF6' }]}
        onPress={() => setVoiceModal(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="mic" size={28} color="#FFFFFF" />
      </TouchableOpacity>

    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  legend: { paddingHorizontal: 16, paddingVertical: 10, gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, fontWeight: '600' },
  grid: { paddingBottom: 120 },
  tableGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingTop: 4 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 32 },
  emptyText: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  emptyHint: { fontSize: 13, textAlign: 'center', marginTop: 6 },
  fab: {
    position: 'absolute', bottom: 100, right: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6D5DF6', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  voiceFab: {
    position: 'absolute', bottom: 170, right: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#8B5CF6', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { padding: 24, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  largeModal: { padding: 24, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: '92%' },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16 },
  modalSub: { fontSize: 12, fontWeight: '600', marginTop: 2, marginBottom: 12 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  orderRow: { padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  orderRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  timelineContent: { flex: 1 },
  timelineTime: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  timelineEvent: { fontSize: 13, fontWeight: '700' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  qtyBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cartBox: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 4 },
  cartRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
});
