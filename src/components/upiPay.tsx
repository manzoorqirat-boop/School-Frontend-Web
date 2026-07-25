import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Platform,
  ActivityIndicator, Linking, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { API } from '@/lib/api';
import { colors, spacing, font, radius } from '@/theme';
import { useToast } from '@/components/toast';

/**
 * Direct-VPA UPI collection for a single invoice.
 *
 * Deliberately NOT a gateway flow. The server builds a spec-compliant
 * `upi://pay` link (GET /api/invoices/{id}/upi-intent) carrying the payee,
 * the outstanding balance and `tr=<invoiceNo>` for reconciliation. Money moves
 * bank-to-bank; no keys, no per-transaction fee.
 *
 * The trade-off is stated plainly in the UI rather than hidden: NOTHING here
 * confirms payment. The app cannot see the school's bank account, so the
 * office still records the payment against the invoice afterwards. A parent
 * who pays and then sees the invoice still marked pending will otherwise
 * assume the payment failed and pay twice.
 *
 * Two audiences, one sheet:
 *   - the parent, on their own phone → tap through to their UPI app
 *   - the office, showing the screen across a counter → parent scans the QR
 */
export function UpiPaySheet({
  invoiceId, visible, onClose,
}: {
  invoiceId?: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [intent, setIntent] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !invoiceId) return;
    let cancelled = false;
    setLoading(true); setIntent(null); setError(null);

    (async () => {
      try {
        const r = await API.get(`/api/invoices/${invoiceId}/upi-intent`);
        if (!cancelled) setIntent(r);
      } catch (e: any) {
        // UPI_NOT_CONFIGURED and NO_BALANCE both arrive here with a message
        // the office wrote for the parent — surface it verbatim rather than
        // replacing it with a generic failure.
        if (!cancelled) setError(e?.message ?? 'Could not start the payment.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [visible, invoiceId]);

  async function openUpiApp() {
    if (!intent?.upiUri) return;
    try {
      // On a phone this hands off to GPay/PhonePe/Paytm. On desktop web there
      // is no handler, so canOpenURL is false and the QR is the only route —
      // say so instead of failing silently on a dead button.
      const ok = await Linking.canOpenURL(intent.upiUri);
      if (!ok) {
        toast.error('No UPI app found', 'Scan the QR code with a UPI app instead.');
        return;
      }
      await Linking.openURL(intent.upiUri);
    } catch {
      toast.error('Could not open UPI app', 'Scan the QR code instead.');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.bg}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Pay by UPI</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.slate} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
            {loading && (
              <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}

            {!loading && error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={20} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {!loading && intent && (
              <>
                <View style={styles.amountBox}>
                  <Text style={styles.amountLabel}>Amount due</Text>
                  <Text style={styles.amount}>
                    ₹{Number(intent.amount ?? 0).toLocaleString('en-IN')}
                  </Text>
                  <Text style={styles.invoiceNo}>{intent.invoiceNo}</Text>
                </View>

                <View style={styles.qrWrap}>
                  <QRCode value={intent.upiUri} size={200} backgroundColor="#FFFFFF" />
                </View>
                <Text style={styles.scanHint}>Scan with any UPI app</Text>

                <View style={styles.vpaRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vpaLabel}>Paying to</Text>
                    <Text style={styles.vpaName}>{intent.payeeName}</Text>
                    {/* selectable, not a Copy button: RN 0.74 dropped the
                        built-in Clipboard and expo-clipboard is not a
                        dependency in either repo (see marks.tsx). Selecting
                        the text works on both platforms with nothing new. */}
                    <Text style={styles.vpa} selectable>{intent.vpa}</Text>
                  </View>
                </View>

                {Platform.OS !== 'web' && (
                  <TouchableOpacity style={styles.payBtn} onPress={openUpiApp}>
                    <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                    <Text style={styles.payBtnText}>Open UPI app</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.noteBox}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.slate} />
                  <Text style={styles.noteText}>
                    This invoice stays marked unpaid until the school office confirms
                    the payment. Please don&apos;t pay twice — if it still shows as due
                    tomorrow, contact the office with your UPI reference number.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xl, maxHeight: '92%',
    ...(Platform.OS === 'web' ? { maxWidth: 520, alignSelf: 'center', width: '100%' } : null),
  },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: { ...font.h2, color: colors.ink },

  amountBox: { alignItems: 'center', gap: 2 },
  amountLabel: { ...font.caption, color: colors.muted, textTransform: 'uppercase' },
  amount: { ...font.display, color: colors.ink },
  invoiceNo: { ...font.caption, color: colors.muted, textTransform: 'none', letterSpacing: 0 },

  qrWrap: {
    alignSelf: 'center', padding: spacing.lg, backgroundColor: '#FFFFFF',
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
  },
  scanHint: { ...font.caption, color: colors.muted, textAlign: 'center', textTransform: 'none', letterSpacing: 0 },

  vpaRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  vpaLabel: { ...font.caption, color: colors.muted, textTransform: 'uppercase' },
  vpaName: { ...font.body, color: colors.ink, fontWeight: '700', marginTop: 2 },
  vpa: { ...font.body, color: colors.slate },

  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: spacing.lg, borderRadius: radius.lg,
  },
  payBtnText: { ...font.body, color: '#fff', fontWeight: '700' },

  noteBox: {
    flexDirection: 'row', gap: 8, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  noteText: { ...font.caption, color: colors.slate, flex: 1, textTransform: 'none', letterSpacing: 0, lineHeight: 17 },

  errorBox: {
    flexDirection: 'row', gap: 8, padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger + '55',
  },
  errorText: { ...font.body, color: colors.ink, flex: 1 },
});
