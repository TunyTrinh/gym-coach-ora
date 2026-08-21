import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CenteredDialog } from "@/components/centered-dialog";
import { PrimaryButton, SurfaceCard } from "@/components/gym-ui";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useLanguage } from "@/lib/language-provider";

export function AdminAccountMenu() {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const colors = useColors();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (user?.role !== "admin") return null;

  const identity = user.name?.trim() || user.email?.trim() || t("adminHub");
  const subtitle = user.email?.trim() || t("adminHub");
  const initial = identity.slice(0, 1).toUpperCase();

  const signOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      queryClient.clear();
      setOpen(false);
      router.dismissAll();
      router.replace("/");
      setIsSigningOut(false);
    }
  };

  return <>
    <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${t("profile")}: ${identity}`} style={({ pressed }) => [styles.trigger, { borderColor: colors.border }, pressed && styles.pressed]}>
      <Text style={styles.triggerInitial}>{initial}</Text>
    </Pressable>
    <CenteredDialog visible={open} onRequestClose={() => setOpen(false)} accessibilityLabel={t("profile")}>
      <SurfaceCard style={styles.dialog}>
        <View style={styles.identityRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
          <View style={styles.identityCopy}>
            <Text numberOfLines={2} style={[styles.name, { color: colors.foreground }]}>{identity}</Text>
            <Text numberOfLines={2} style={[styles.email, { color: colors.muted }]}>{subtitle}</Text>
            <Text style={styles.role}>{t("adminHub")}</Text>
          </View>
          <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t("close")} hitSlop={8} style={({ pressed }) => [styles.closeButton, { borderColor: colors.border }, pressed && styles.pressed]}>
            <Text style={[styles.closeButtonText, { color: colors.foreground }]}>×</Text>
          </Pressable>
        </View>
        <View style={styles.languageSection}>
          <Text style={[styles.label, { color: colors.muted }]}>{t("language")}</Text>
          <View style={styles.languageChoices}>
            {(["en", "vi"] as const).map((option) => <Pressable key={option} onPress={() => setLanguage(option)} accessibilityRole="button" accessibilityState={{ selected: language === option }} style={[styles.languageChoice, { borderColor: language === option ? "#ff82b7" : colors.border, backgroundColor: language === option ? "#2b1f2a" : "#151518" }]}><Text style={[styles.languageText, { color: language === option ? "#ff82b7" : colors.foreground }]}>{option === "en" ? t("english") : t("vietnamese")}</Text></Pressable>)}
          </View>
        </View>
        <PrimaryButton title={isSigningOut ? t("loading") : t("signOut")} onPress={signOut} disabled={isSigningOut} />
      </SurfaceCard>
    </CenteredDialog>
  </>;
}

const styles = StyleSheet.create({
  trigger: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#2b1f2a" },
  triggerInitial: { color: "#ff82b7", fontSize: 15, fontWeight: "900" },
  dialog: { width: "100%", maxWidth: 360, alignSelf: "center", gap: 18, marginBottom: 0 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#2b1f2a" },
  avatarText: { color: "#ff82b7", fontSize: 20, fontWeight: "900" },
  identityCopy: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 17, fontWeight: "900", lineHeight: 22 },
  email: { fontSize: 12, lineHeight: 17 },
  role: { color: "#ff82b7", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginTop: 3 },
  closeButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", flexShrink: 0 },
  closeButtonText: { fontSize: 28, fontWeight: "400", lineHeight: 30, textAlign: "center", includeFontPadding: false },
  languageSection: { gap: 8 },
  label: { fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  languageChoices: { flexDirection: "row", gap: 8 },
  languageChoice: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, justifyContent: "center", alignItems: "center", paddingHorizontal: 10 },
  languageText: { fontSize: 12, fontWeight: "800", textAlign: "center" },
  pressed: { opacity: 0.72 },
});
