import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, radius, space } from '../theme';

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Branded replacement for Alert.alert — kiosk-sized touch targets, hazard
// rail, instrument palette — instead of the plain OS dialog.
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'CONFIRM',
  cancelLabel = 'CANCEL',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View aria-hidden style={styles.rail}>
            {Array.from({ length: 12 }).map((_, i) => (
              <View key={i} style={styles.railSegment} />
            ))}
          </View>
          <View style={styles.body}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}

            <View style={styles.actions}>
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [styles.btn, styles.cancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>{cancelLabel}</Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                style={({ pressed }) => [
                  styles.btn,
                  destructive ? styles.destructiveBtn : styles.confirmBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={destructive ? styles.destructiveText : styles.confirmText}>
                  {confirmLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(14,27,46,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 32,
  },
  rail: {
    height: 8,
    flexDirection: 'row',
    backgroundColor: color.ink,
    overflow: 'hidden',
  },
  railSegment: {
    width: 22,
    height: 8,
    backgroundColor: color.danfo,
    transform: [{ skewX: '-30deg' }],
    marginRight: 14,
  },
  body: {
    padding: space.xl,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: color.ink,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    color: color.sub,
    marginTop: space.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xl,
  },
  btn: {
    flex: 1,
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  cancelBtn: {
    backgroundColor: color.canvas,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: color.sub,
  },
  confirmBtn: {
    backgroundColor: color.danfo,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: color.ink,
  },
  destructiveBtn: {
    backgroundColor: color.stopRed,
  },
  destructiveText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: color.white,
  },
});
