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

// Branded replacement for Alert.alert — a BusBuzz-styled modal (hazard rail,
// ledger typography, danfo-amber / stop-red actions) instead of the plain OS
// dialog, so confirmations feel part of the app.
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Inner press is swallowed so tapping the card doesn't dismiss. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <View aria-hidden style={styles.rail} />
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
    backgroundColor: 'rgba(10,14,25,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: color.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 32,
    elevation: 12,
  },
  rail: {
    height: 6,
    backgroundColor: color.danfo500,
  },
  body: {
    padding: space.xl,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: color.ink900,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: color.ledger400,
    marginTop: space.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xl,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  cancelBtn: {
    backgroundColor: color.paper100,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: color.ledger700,
  },
  confirmBtn: {
    backgroundColor: color.danfo500,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '800',
    color: color.ink900,
  },
  destructiveBtn: {
    backgroundColor: color.stopRed,
  },
  destructiveText: {
    fontSize: 15,
    fontWeight: '800',
    color: color.white,
  },
});
