import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../../lib/supabase';
import { CHILD_COLOR_PALETTE, getChildColors, setChildColor } from './childColors';
import { BellIcon, SchoolIcon } from './components/Icons';
import type { MainStackParamList, ParentTabParamList } from './ParentApp';
import { getPushPermissionStatus, registerForPushNotifications } from './pushNotifications';
import { useStudents } from './StudentContext';
import { color, radius, space, type } from './theme';

type ProfileNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<ParentTabParamList, 'Profile'>,
  NativeStackNavigationProp<MainStackParamList>
>;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileNavigationProp>();
  const { students } = useStudents();

  const [parentName, setParentName] = useState<string | null>(null);
  const [parentEmail, setParentEmail] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const [childColors, setChildColors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (students.length === 0) return;
    getChildColors(students.map((s) => s.id)).then(setChildColors);
  }, [students]);

  async function handlePickColor(studentId: string, colorHex: string) {
    setChildColors((prev) => ({ ...prev, [studentId]: colorHex }));
    await setChildColor(studentId, colorHex);
  }

  const loadAccount = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setParentEmail(user.email ?? null);

    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();

    if (profile?.name) setParentName(profile.name);

    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null);

    setUnreadCount(count ?? 0);
  }, []);

  const loadPushStatus = useCallback(async () => {
    const status = await getPushPermissionStatus();
    setPushEnabled(status === 'granted');
  }, []);

  useEffect(() => {
    loadAccount();
    loadPushStatus();
  }, [loadAccount, loadPushStatus]);

  async function handlePushRowPress() {
    if (pushEnabled) {
      Linking.openSettings();
      return;
    }

    setIsRegisteringPush(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        const granted = await registerForPushNotifications(session.access_token);
        setPushEnabled(granted);
      }
    } finally {
      setIsRegisteringPush(false);
    }
  }

  function handleLogOut() {
    Alert.alert('Log out', 'Are you sure you want to log out of BusBuzz?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ]);
  }

  const [isDeleting, setIsDeleting] = useState(false);

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This permanently deletes your BusBuzz account and your access to your children’s bus tracking. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const {
                data: { session },
              } = await supabase.auth.getSession();
              if (!session?.access_token) {
                Alert.alert('Error', 'Please log in again.');
                return;
              }
              const res = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
                  },
                },
              );
              if (!res.ok) {
                Alert.alert('Error', 'Could not delete your account. Please try again.');
                return;
              }
              await supabase.auth.signOut();
            } catch {
              Alert.alert('Could not delete your account. Please try again.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>Account</Text>
        <Text style={styles.headerTitle}>{parentName ?? parentEmail ?? 'Parent'}</Text>
        {parentEmail ? <Text style={styles.headerSubtitle}>{parentEmail}</Text> : null}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {students.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {students.length === 1 ? 'Your child' : 'Your children'}
            </Text>
            {students.map((student) => {
              const swatchColor = childColors[student.id] ?? color.danfo500;
              return (
                <View key={student.id} style={styles.childCard}>
                  <View style={styles.childRow}>
                    <View style={[styles.childAvatar, { backgroundColor: swatchColor }]}>
                      <Text style={styles.childAvatarText}>{getInitials(student.name)}</Text>
                    </View>
                    <View style={styles.childInfo}>
                      <Text style={styles.childName}>{student.name}</Text>
                      <Text style={styles.childMeta}>
                        {student.className}
                        {student.schoolName ? ` · ${student.schoolName}` : ''}
                      </Text>
                    </View>
                    {student.routeName ? (
                      <View style={styles.routeBadge}>
                        <Text style={styles.routeBadgeText}>{student.routeName}</Text>
                      </View>
                    ) : null}
                  </View>

                  {students.length > 1 ? (
                    <View style={styles.swatchRow}>
                      <Text style={styles.swatchLabel}>Map color</Text>
                      <View style={styles.swatchOptions}>
                        {CHILD_COLOR_PALETTE.map((option) => (
                          <Pressable
                            key={option}
                            onPress={() => handlePickColor(student.id, option)}
                            style={[
                              styles.swatch,
                              { backgroundColor: option },
                              option === swatchColor && styles.swatchSelected,
                            ]}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Notifications</Text>

          <Pressable
            style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
            onPress={() => navigation.navigate('Notifications')}
          >
            <View style={styles.actionIconWrap}>
              <BellIcon size={18} color={color.ledger700} />
            </View>
            <Text style={styles.actionLabel}>Notification history</Text>
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            ) : null}
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
            onPress={handlePushRowPress}
            disabled={isRegisteringPush}
          >
            <View style={styles.actionIconWrap}>
              <SchoolIcon size={18} color={color.ledger700} />
            </View>
            <Text style={styles.actionLabel}>Push notifications</Text>
            <Text style={styles.actionValue}>
              {isRegisteringPush ? 'Requesting…' : pushEnabled ? 'On' : 'Turn on'}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Pressable
            style={({ pressed }) => [styles.logOutButton, pressed && styles.logOutButtonPressed]}
            onPress={handleLogOut}
          >
            <Text style={styles.logOutText}>Log out</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.deleteRow, pressed && styles.actionRowPressed]}
            onPress={handleDeleteAccount}
            disabled={isDeleting}
          >
            <Text style={styles.deleteText}>
              {isDeleting ? 'Deleting…' : 'Delete account'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.versionText}>
          BusBuzz v{Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.paper50,
  },
  header: {
    backgroundColor: color.ink900,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  headerEyebrow: {
    ...type.eyebrow,
    color: color.danfo500,
    marginBottom: 2,
  },
  headerTitle: {
    color: color.white,
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: color.mist400,
    fontSize: 13,
    marginTop: 2,
  },
  scrollContent: {
    padding: space.lg,
    paddingBottom: space.xxxl,
  },
  section: {
    marginBottom: space.xl,
  },
  sectionLabel: {
    ...type.eyebrow,
    fontSize: 11,
    color: color.ledger400,
    marginBottom: space.sm,
    marginLeft: space.xs,
  },
  childCard: {
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.paper100,
  },
  swatchLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: color.ledger400,
    marginRight: space.md,
  },
  swatchOptions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: color.ledger700,
  },
  childAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.danfo500,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  childAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: color.ink900,
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 15,
    fontWeight: '700',
    color: color.ledger700,
  },
  childMeta: {
    fontSize: 12,
    color: color.ledger400,
    marginTop: 1,
  },
  routeBadge: {
    backgroundColor: color.paper100,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginLeft: space.sm,
  },
  routeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: color.ledger700,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.white,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  actionRowPressed: {
    opacity: 0.85,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: color.paper100,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  actionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: color.ledger700,
  },
  actionValue: {
    fontSize: 13,
    fontWeight: '700',
    color: color.ledger400,
    marginRight: space.xs,
  },
  chevron: {
    fontSize: 20,
    color: color.ledger400,
    marginLeft: space.xs,
  },
  unreadBadge: {
    backgroundColor: color.danfo500,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.xs,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: color.ink900,
  },
  logOutButton: {
    borderWidth: 1.5,
    borderColor: color.stopRed,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logOutButtonPressed: {
    backgroundColor: color.stopRedBg,
  },
  logOutText: {
    color: color.stopRed,
    fontSize: 15,
    fontWeight: '800',
  },
  deleteRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
    marginTop: space.sm,
  },
  deleteText: {
    color: color.ledger400,
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: color.ledger400,
    marginTop: space.lg,
  },
});
