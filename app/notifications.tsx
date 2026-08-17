import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScreenContainer } from "@/components/screen-container";
import { StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useGym } from "@/lib/gym-store";
import { useLanguage } from "@/lib/language-provider";
import { isLocalTestMode } from "@/lib/local-test-mode";
import { trpc } from "@/lib/trpc";

function localizeNotification(title: string, message: string, t: (key: any) => string) {
  if (title === "Coach session booked") return { title: t("coachSessionBooked"), message: t("sessionBookedMessage") };
  if (title === "New client booking") return { title: t("newClientBooking"), message: t("clientBookedWindow") };
  if (title === "Client session cancelled") {
    const suffix = " cancelled a session in your availability window.";
    const clientName = message.endsWith(suffix) ? message.slice(0, -suffix.length) : "";
    return { title: t("clientSessionCancelled"), message: clientName ? `${clientName} ${t("clientCancelledWindow")}` : message };
  }
  return { title, message };
}

export default function NotificationsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { snapshot, unreadCount, markNotificationRead, markAllNotificationsRead } = useGym();
  const { language, t } = useLanguage();
  const previewMode = isLocalTestMode();
  const serverNotifications = trpc.member.notifications.useQuery(undefined, { enabled: !previewMode && Boolean(user) });
  const markServerNotificationRead = trpc.member.markNotificationRead.useMutation();
  const markAllServerNotificationsRead = trpc.member.markAllNotificationsRead.useMutation();
  const utils = trpc.useUtils();
  const items = previewMode ? snapshot.notifications : (serverNotifications.data ?? []).map((item) => ({ ...item, id: String(item.id), createdAt: new Date(item.createdAt).toISOString() }));
  const activeUnreadCount = previewMode ? unreadCount : items.filter((item) => !item.read).length;
  const markRead = async (notificationId: string) => {
    if (previewMode) { markNotificationRead(notificationId); return; }
    await markServerNotificationRead.mutateAsync({ notificationId: Number(notificationId) });
    await utils.member.notifications.invalidate();
  };
  const markAllRead = async () => {
    if (previewMode) { markAllNotificationsRead(); return; }
    await markAllServerNotificationsRead.mutateAsync();
    await utils.member.notifications.invalidate();
  };
  return <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={t("goBack")}><IconSymbol name="chevron.left" size={20} color={colors.foreground} /></Pressable><View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: colors.primary }]}>{t("inbox")}</Text><Text style={[styles.title, { color: colors.foreground }]}>{t("notifications")}</Text></View>{activeUnreadCount > 0 ? <Pressable onPress={() => void markAllRead()} accessibilityRole="button"><Text style={[styles.markAll, { color: colors.primary }]}>{t("markAllRead")}</Text></Pressable> : null}</View>
      <Text style={[styles.subtitle, { color: colors.muted }]}>{activeUnreadCount ? `${activeUnreadCount} ${t("unreadUpdates")}` : t("allCaughtUp")}</Text>
      <View style={styles.list}>{items.map((item) => { const content = localizeNotification(item.title, item.message, t); return <SurfaceCard key={item.id} style={[styles.noteCard, !item.read && { borderColor: `${colors.primary}70` }]} onPress={() => { void markRead(item.id); if (item.relatedBookingId) router.push("/schedule"); }} accessibilityLabel={`${t("openNotification")} ${content.title}`}><View style={styles.noteTop}><View style={[styles.noteIcon, { backgroundColor: item.read ? `${colors.muted}16` : `${colors.primary}18` }]}><IconSymbol name={item.type === "reminder" ? "clock" : item.type === "announcement" ? "sparkles" : "bell.fill"} size={18} color={item.read ? colors.muted : colors.primary} /></View><View style={styles.noteCopy}><View style={styles.noteTitleRow}><Text style={[styles.noteTitle, { color: colors.foreground }]}>{content.title}</Text>{!item.read ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}</View><Text style={[styles.noteMessage, { color: colors.muted }]}>{content.message}</Text><Text style={[styles.noteTime, { color: colors.muted }]}>{new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(item.createdAt))}</Text></View></View>{item.priority === "Important" ? <StatusBadge label={t("important")} tone="accent" /> : null}</SurfaceCard>; })}</View>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  backButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 3 },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  markAll: { fontSize: 12, fontWeight: "800" },
  subtitle: { fontSize: 14, marginBottom: 8 },
  list: { gap: 10 },
  noteCard: { padding: 15, gap: 12 },
  noteTop: { flexDirection: "row", gap: 11 },
  noteIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  noteCopy: { flex: 1, gap: 4 },
  noteTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  noteTitle: { fontSize: 14, fontWeight: "800", flex: 1 },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  noteMessage: { fontSize: 12, lineHeight: 18 },
  noteTime: { fontSize: 11, marginTop: 2 },
});
