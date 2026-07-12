// Horizontal avatar-chip row for households with more than one child on
// BusBuzz. Hidden entirely for single-child accounts, which stay exactly as
// simple as before.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LinkedStudent } from '../StudentContext';
import { color, radius, space } from '../theme';

type Props = {
  students: LinkedStudent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  variant?: 'light' | 'dark';
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ChildSwitcher({ students, selectedId, onSelect, variant = 'light' }: Props) {
  if (students.length < 2) return null;

  const isDark = variant === 'dark';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {students.map((student) => {
        const active = student.id === selectedId;
        return (
          <Pressable
            key={student.id}
            onPress={() => onSelect(student.id)}
            style={[
              styles.chip,
              isDark ? styles.chipDark : styles.chipLight,
              active && styles.chipActive,
            ]}
          >
            <View style={[styles.avatar, active && styles.avatarActive]}>
              <Text style={[styles.avatarText, active && styles.avatarTextActive]}>
                {getInitials(student.name)}
              </Text>
            </View>
            <Text
              style={[
                styles.name,
                isDark ? styles.nameDark : styles.nameLight,
                active && styles.nameActive,
              ]}
              numberOfLines={1}
            >
              {student.name.split(' ')[0]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: space.sm,
    paddingBottom: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.xs,
    paddingRight: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipLight: {
    backgroundColor: color.paper100,
  },
  chipDark: {
    backgroundColor: color.ink700,
  },
  chipActive: {
    borderColor: color.danfo500,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.paper50,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.xs + 2,
  },
  avatarActive: {
    backgroundColor: color.danfo500,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '800',
    color: color.ledger700,
  },
  avatarTextActive: {
    color: color.ink900,
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 80,
  },
  nameLight: {
    color: color.ledger400,
  },
  nameDark: {
    color: color.mist400,
  },
  nameActive: {
    color: color.danfo500,
  },
});
