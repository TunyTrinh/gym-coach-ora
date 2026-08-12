import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Avatar, GhostButton, OfflineBanner, ScreenHeader, SectionTitle, SpectrumCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useGym } from "@/lib/gym-store";
import { formatShortDate, formatTime, getBookingSlot, getCoach, getService } from "@/shared/gym";

export default function HomeScreen() {
  const colors = useColors();
  const { snapshot, upcomingBookings, historyBookings, unreadCount } = useGym();
  const nextBooking = upcomingBookings[0];
  const nextSlot = nextBooking ? getBookingSlot(snapshot, nextBooking) : undefined;
  const nextService = nextSlot ? getService(snapshot, nextSlot.serviceTypeId) : undefined;
  const nextCoach = nextSlot ? getCoach(snapshot, nextSlot.coachId) : undefined;
  const announcement = snapshot.announcements[0];
  const firstName = snapshot.member.fullName.split(" ")[0];
  const completedCount = historyBookings.filter((booking) => booking.status === "Completed").length;
  const activeCount = upcomingBookings.length + completedCount;
  const checkedInCount = snapshot.bookings.filter((booking) => Boolean(booking.checkInTime)).length;
  const attendanceRate = historyBookings.length ? Math.round((completedCount / Math.max(1, historyBookings.filter((booking) => booking.status !== "Cancelled").length)) * 100) : 0;

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={`Hey, ${firstName}`} subtitle="Ready to move with purpose?" onPress={() => router.push("/notifications")} badge={unreadCount} label="NORTHSTAR · GYMFLOW" />
      <OfflineBanner label="Your schedule is kept ready, even offline" />

      <SpectrumCard style={styles.heroCard} onPress={() => router.push("/schedule")} accessibilityLabel="Open your next booking">
        <View style={styles.heroTopRow}><View><Text style={styles.heroEyebrow}>NEXT SESSION</Text><Text style={styles.heroTitle}>{nextService?.name ?? "Make your next move"}</Text></View><StatusBadge label={nextBooking?.status ?? "Open"} tone={nextBooking ? "success" : "accent"} /></View>
        {nextSlot ? <><Text style={styles.heroDate}>{formatShortDate(nextSlot.start)} · {formatTime(nextSlot.start)}</Text><View style={styles.heroMetaRow}>{nextCoach ? <Avatar initials={nextCoach.initials} accent={nextCoach.accent} size={36} /> : <View style={styles.metaIcon}><Text style={styles.metaIconText}>⌁</Text></View>}<View style={styles.heroCopy}><Text style={styles.heroMeta}>{nextCoach?.fullName ?? "Open gym access"}</Text><Text style={styles.heroMetaMuted}>{nextSlot.room} · {snapshot.gyms[0]?.name}</Text></View><View style={styles.heroArrow}><Text style={styles.heroArrowText}>→</Text></View></View></> : <Text style={styles.heroEmpty}>Browse the week and claim a session that fits your rhythm.</Text>}
      </SpectrumCard>

      <View style={styles.actionRow}>
        <Pressable onPress={() => router.push("/book")} style={({ pressed }) => [styles.actionCard, styles.bookAction, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Book a session"><Text style={styles.actionIcon}>＋</Text><View><Text style={styles.actionTitle}>Book</Text><Text style={styles.actionSubtitle}>Find a fresh slot</Text></View></Pressable>
        <Pressable onPress={() => router.push("/schedule")} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Open my schedule"><Text style={[styles.actionIcon, { color: "#a98af0" }]}>◷</Text><View><Text style={[styles.actionTitle, { color: colors.foreground }]}>Schedule</Text><Text style={[styles.actionSubtitle, { color: colors.muted }]}>{upcomingBookings.length} upcoming</Text></View></Pressable>
      </View>

      <SectionTitle title="Your rhythm" eyebrow="THIS WEEK" action="History" onAction={() => router.push("/history")} />
      <SurfaceCard style={styles.statsCard}><Metric value={String(activeCount).padStart(2, "0")} label="Sessions" color={colors.foreground} /><View style={[styles.statDivider, { backgroundColor: colors.border }]} /><Metric value={String(checkedInCount).padStart(2, "0")} label="Check-ins" color={colors.foreground} /><View style={[styles.statDivider, { backgroundColor: colors.border }]} /><Metric value={`${attendanceRate}%`} label="Attendance" color="#ff82b7" /></SurfaceCard>

      <SectionTitle title="From the gym" action="All updates" onAction={() => router.push("/notifications")} />
      <SurfaceCard style={styles.announcementCard} onPress={() => router.push("/notifications")} accessibilityLabel="Open latest gym announcement"><View style={styles.announcementTop}><StatusBadge label={announcement?.priority ?? "Normal"} tone="accent" /><Text style={[styles.announcementTime, { color: colors.muted }]}>Today</Text></View><Text style={[styles.announcementTitle, { color: colors.foreground }]}>{announcement?.title ?? "You’re all set"}</Text><Text style={[styles.announcementMessage, { color: colors.muted }]}>{announcement?.message ?? "Your gym updates will appear here."}</Text></SurfaceCard>

      <SurfaceCard style={styles.membershipCard}><View style={styles.membershipCopy}><Text style={[styles.membershipLabel, { color: "#a98af0" }]}>MEMBERSHIP</Text><Text style={[styles.membershipTitle, { color: colors.foreground }]}>{snapshot.member.membershipPlan}</Text><Text style={[styles.membershipExpiry, { color: colors.muted }]}>Active · renews in 42 days</Text></View><GhostButton title="View" onPress={() => router.push("/profile")} /></SurfaceCard>
    </ScrollView>
  </ScreenContainer>;
}

function Metric({ value, label, color }: { value: string; label: string; color: string }) {
  return <View style={styles.stat}><Text style={[styles.statValue, { color }]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 38, gap: 20 },
  heroCard: { minHeight: 214 },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  heroEyebrow: { color: "rgba(255,255,255,0.76)", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 6 },
  heroTitle: { color: "#ffffff", fontSize: 25, fontWeight: "800", letterSpacing: -0.65, maxWidth: 226 },
  heroDate: { color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: "800", marginTop: 19 },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  heroCopy: { flex: 1 },
  heroMeta: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  heroMetaMuted: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 3 },
  heroArrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(10,10,14,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroArrowText: { color: "#ffffff", fontSize: 21 },
  heroEmpty: { color: "rgba(255,255,255,0.82)", lineHeight: 21, marginTop: 18 },
  metaIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(13,13,15,0.2)", alignItems: "center", justifyContent: "center" },
  metaIconText: { color: "#ffffff", fontSize: 18 },
  actionRow: { flexDirection: "row", gap: 12 },
  actionCard: { flex: 1, minHeight: 122, borderRadius: 22, borderWidth: 1, padding: 16, justifyContent: "space-between" },
  bookAction: { backgroundColor: "#26222b", borderColor: "rgba(255,130,183,0.35)" },
  actionIcon: { color: "#ff82b7", fontSize: 28, fontWeight: "300", lineHeight: 30 },
  actionTitle: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  actionSubtitle: { color: "#b4b4bd", fontSize: 12, marginTop: 3 },
  statsCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: 18 },
  stat: { alignItems: "center", gap: 4, flex: 1 },
  statValue: { fontSize: 23, fontWeight: "800", letterSpacing: -0.4 },
  statLabel: { color: "#777780", fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },
  statDivider: { width: 1, height: 30 },
  announcementCard: { gap: 9 },
  announcementTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  announcementTime: { fontSize: 11, fontWeight: "700" },
  announcementTitle: { fontSize: 17, fontWeight: "800", marginTop: 2 },
  announcementMessage: { fontSize: 13, lineHeight: 20 },
  membershipCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  membershipCopy: { flex: 1, gap: 4 },
  membershipLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  membershipTitle: { fontSize: 15, fontWeight: "800" },
  membershipExpiry: { fontSize: 12 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
