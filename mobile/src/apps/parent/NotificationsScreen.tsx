import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import { BackpackIcon, BellIcon, PinIcon, SchoolIcon } from './components/Icons';
import { color, radius, space, type } from './theme';

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function NotificationIcon({ notification }: { notification: NotificationRow }) {
  const notifType = notification.data?.type;
  const status = notification.data?.status;

  if (notifType === 'geofence') {
    return (
      <View style={[styles.iconWrap, { backgroundColor: 'rgba(255,201,0,0.16)' }]}>
        <PinIcon size={18} color={color.danfo600} />
      </View>
    );
  }

  if (notifType === 'attendance') {
    if (status === 'BOARDED') {
      return (
        <View style={[styles.iconWrap, { backgroundColor: color.routeGreenBg }]}>
          <BackpackIcon size={18} color={color.routeGreen} />
        </View>
      );
    }
    if (status === 'DROPPED_OFF') {
      return (
        <View style={[styles.iconWrap, { backgroundColor: color.routeGreenBg }]}>
          <SchoolIcon size={18} color={color.routeGreen} />
        </View>
      );
    }
    if (status === 'ABSENT') {
      return (
        <View style={[styles.iconWrap, { backgroundColor: color.stopRedBg }]}>
          <BellIcon size={18} color={color.stopRed} />
        </View>
      );
    }
  }

  return (
    <View style={[styles.iconWrap, { backgroundColor: color.paper100 }]}>
      <BellIcon size={18} color={color.ledger400} />
    </View>
  );
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorMessage('Session expired. Please log in again.');
        return;
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('id, title, body, data, read_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        setErrorMessage('Could not load notifications. Try again.');
        return;
      }

      setNotifications(
        (data ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          data: row.data,
          readAt: row.read_at,
          createdAt: row.created_at,
        })),
      );
    } catch {
      setErrorMessage('Something went wrong. Try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(notification: NotificationRow) {
    if (notification.readAt) return;

    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((n) => (n.id === notification.id ? { ...n, readAt } : n)),
    );

    await supabase.from('notifications').update({ read_at: readAt }).eq('id', notification.id);
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((n) => (n.readAt ? n : { ...n, readAt })));

    await supabase.from('notifications').update({ read_at: readAt }).in('id', unreadIds);
  }

  async function deleteOne(notification: NotificationRow) {
    setNotifications((current) => current.filter((n) => n.id !== notification.id));
    await supabase.from('notifications').delete().eq('id', notification.id);
  }

  function confirmClearAll() {
    Alert.alert(
      'Clear all notifications?',
      'This removes every notification in the list. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            const ids = notifications.map((n) => n.id);
            setNotifications([]);
            if (ids.length > 0) {
              await supabase.from('notifications').delete().in('id', ids);
            }
          },
        },
      ],
    );
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['bottom']}>
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['bottom']}>
        <Text style={styles.errorText}>{errorMessage}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <BellIcon size={40} color={color.ledger400} />
          <Text style={styles.emptyStateTitle}>No notifications yet</Text>
          <Text style={styles.emptyStateText}>
            Bus approach alerts and boarding updates will show up here.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.actionsBar}>
            <Text style={styles.actionsCount}>
              {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}
            </Text>
            <View style={styles.actionsButtons}>
              {unreadCount > 0 ? (
                <Pressable
                  onPress={markAllRead}
                  style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                >
                  <Text style={styles.actionBtnText}>Mark all read</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={confirmClearAll}
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              >
                <Text style={[styles.actionBtnText, styles.actionBtnDanger]}>Clear all</Text>
              </Pressable>
            </View>
          </View>
          <FlatList<NotificationRow>
            data={notifications}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => load(true)}
                tintColor={color.danfo500}
              />
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => markRead(item)}
              >
                <NotificationIcon notification={item} />
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.title, !item.readAt && styles.titleUnread]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.body} numberOfLines={2}>
                    {item.body}
                  </Text>
                </View>
                {!item.readAt ? <View style={styles.unreadDot} /> : null}
                <Pressable
                  onPress={() => deleteOne(item)}
                  hitSlop={10}
                  accessibilityLabel="Delete notification"
                  style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
                >
                  <Text style={styles.deleteGlyph}>✕</Text>
                </Pressable>
              </Pressable>
            )}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.paper50,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.paper50,
  },
  loadingText: {
    color: color.ledger400,
    fontSize: 16,
  },
  errorText: {
    color: color.ledger400,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: color.ledger700,
    marginTop: space.lg,
    marginBottom: space.xs,
  },
  emptyStateText: {
    color: color.ledger400,
    fontSize: 14,
    textAlign: 'center',
  },
  actionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  actionsCount: {
    ...type.data,
    fontSize: 12,
    color: color.ledger400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  actionsButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: color.white,
  },
  actionBtnPressed: {
    opacity: 0.7,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: color.ledger700,
  },
  actionBtnDanger: {
    color: color.stopRed,
  },
  listContent: {
    padding: space.lg,
    paddingTop: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: space.lg,
    marginBottom: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  rowPressed: {
    opacity: 0.85,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  rowBody: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: color.ledger700,
    flex: 1,
    marginRight: space.sm,
  },
  titleUnread: {
    fontWeight: '800',
  },
  time: {
    ...type.data,
    fontSize: 11,
    color: color.ledger400,
  },
  body: {
    fontSize: 13,
    color: color.ledger400,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.danfo500,
    marginLeft: space.sm,
    marginTop: 6,
  },
  deleteBtn: {
    marginLeft: space.sm,
    marginTop: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnPressed: {
    backgroundColor: color.paper100,
  },
  deleteGlyph: {
    fontSize: 13,
    lineHeight: 16,
    color: color.ledger400,
    fontWeight: '600',
  },
});
