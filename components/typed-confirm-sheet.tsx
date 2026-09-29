import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useState } from "react";

import { useColors } from "@/hooks/use-colors";
import { CenteredDialog } from "@/components/centered-dialog";
import { matchesConfirmationName } from "@/shared/confirmation-name";

type TypedConfirmSheetProps = {
  visible: boolean;
  title: string;
  message: string;
  itemName: string;
  inputLabel: string;
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (confirmationName: string) => void;
  pending?: boolean;
};

/** A deliberate destructive-action gate that requires exact visible-name entry. */
export function TypedConfirmSheet({ visible, title, message, itemName, inputLabel, cancelLabel, confirmLabel, onCancel, onConfirm, pending = false }: TypedConfirmSheetProps) {
  const colors = useColors();
  const [confirmationName, setConfirmationName] = useState("");
  const confirmed = matchesConfirmationName(confirmationName, itemName);
  const close = () => {
    if (pending) return;
    setConfirmationName("");
    onCancel();
  };
  const confirm = () => {
    if (!confirmed || pending) return;
    setConfirmationName("");
    onConfirm(confirmationName.trim());
  };

  return <CenteredDialog visible={visible} onRequestClose={close} dismissible={!pending} accessibilityLabel={title} contentStyle={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.icon}><Text style={styles.iconText}>!</Text></View>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.name, { color: "#ff9994" }]} numberOfLines={2}>{itemName}</Text>
        <Text style={[styles.message, { color: colors.muted }]}>{message}</Text>
        <Text style={[styles.label, { color: colors.muted }]}>{inputLabel}</Text>
        <TextInput value={confirmationName} onChangeText={setConfirmationName} placeholder={itemName} placeholderTextColor="#777780" autoCapitalize="words" autoCorrect={false} editable={!pending} style={[styles.input, { color: colors.foreground, borderColor: confirmed ? "#ff766e" : colors.border }]} />
        <View style={styles.actions}>
          <Pressable onPress={close} accessibilityRole="button" disabled={pending} style={styles.cancelButton}><Text style={[styles.cancelText, { color: colors.foreground }]}>{cancelLabel}</Text></Pressable>
          <Pressable onPress={confirm} accessibilityRole="button" disabled={!confirmed || pending} style={({ pressed }) => [styles.confirmButton, (!confirmed || pending) && styles.confirmDisabled, pressed && confirmed && styles.confirmPressed]}><Text style={styles.confirmText}>{pending ? "…" : confirmLabel}</Text></Pressable>
        </View>
  </CenteredDialog>;
}

const styles = StyleSheet.create({
  sheet: { borderRadius: 25, borderWidth: 1, padding: 20, gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#391f22" },
  iconText: { color: "#ff9994", fontSize: 19, fontWeight: "900" },
  title: { fontSize: 20, fontWeight: "900", marginTop: 2 },
  name: { fontSize: 15, fontWeight: "900" },
  message: { fontSize: 13, lineHeight: 19 },
  label: { marginTop: 4, fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  input: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderRadius: 13, backgroundColor: "#111113", fontSize: 15 },
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#26262b" },
  cancelText: { fontSize: 14, fontWeight: "800" },
  confirmButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#b8333f" },
  confirmDisabled: { opacity: 0.42 },
  confirmPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  confirmText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
});
