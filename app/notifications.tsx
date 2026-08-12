import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScreenContainer } from "@/components/screen-container";
import { StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { useColors } from "@/hooks/use-colors";
import { useGym } from "@/lib/gym-store";

export default function NotificationsScreen() {
  const colors = useColors();
  const { snapshot, unreadCount, markNotificationRead, markAllNotificationsRead } = useGym();
  return <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Go back"><IconSymbol name="chevron.left" size={20} color={colors.foreground} /></Pressable><View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: colors.primary }]}>INBOX</Text><Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text></View>{unreadCount > 0 ? <Pressable onPress={markAllNotificationsRead} accessibilityRole="button"><Text style={[styles.markAll, { color: colors.primary }]}>Mark all read</Text></Pressable> : null}</View>
      <Text style={[styles.subtitle, { color: colors.muted }]}>{unreadCount ? `${unreadCount} unread updates from your gym.` : "You’re all caught up."}</Text>
      <View style={styles.list}>{snapshot.notifications.map((item) => <SurfaceCard key={item.id} style={[styles.noteCard, !item.read && { borderColor: `${colors.primary}70` }]} onPress={() => { markNotificationRead(item.id); if (item.relatedBookingId) router.push("/schedule"); }} accessibilityLabel={`Open notification ${item.title}`}><View style={styles.noteTop}><View style={[styles.noteIcon, { backgroundColor: item.read ? `${colors.muted}16` : `${colors.primary}18` }]}><IconSymbol name={item.type === "reminder" ? "clock" : item.type === "announcement" ? "sparkles" : "bell.fill"} size={18} color={item.read ? colors.muted : colors.primary} /></View><View style={styles.noteCopy}><View style={styles.noteTitleRow}><Text style={[styles.noteTitle, { color: colors.foreground }]}>{item.title}</Text>{!item.read ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}</View><Text style={[styles.noteMessage, { color: colors.muted }]}>{item.message}</Text><Text style={[styles.noteTime, { color: colors.muted }]}>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(item.createdAt))}</Text></View></View>{item.priority === "Important" ? <StatusBadge label="Important" tone="accent" /> : null}</SurfaceCard>)}</View>
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
