import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Avatar, GhostButton, OfflineBanner, ScreenHeader, SectionTitle, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useGym } from "@/lib/gym-store";
import { formatShortDate, formatTime, getBookingSlot, getCoach, getService } from "@/shared/gym";

export default function HomeScreen() {
  const colors = useColors();
  const { snapshot, upcomingBookings, unreadCount } = useGym();
  const nextBooking = upcomingBookings[0];
  const nextSlot = nextBooking ? getBookingSlot(snapshot, nextBooking) : undefined;
  const nextService = nextSlot ? getService(snapshot, nextSlot.serviceTypeId) : undefined;
  const nextCoach = nextSlot ? getCoach(snapshot, nextSlot.coachId) : undefined;
  const announcement = snapshot.announcements[0];
  const firstName = snapshot.member.fullName.split(" ")[0];

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title={`Welcome back, ${firstName}`} subtitle="Keep your momentum going." onPress={() => router.push("/notifications")} badge={unreadCount} />
        <OfflineBanner label="Your schedule stays available offline" />

        <View style={styles.heroWrap}>
          <View style={[styles.heroGlow, { backgroundColor: colors.primary }]} />
          <View style={styles.heroContent}>
            <View style={styles.heroTopRow}>
              <View>
                <Text style={styles.heroEyebrow}>NEXT UP</Text>
                <Text style={styles.heroTitle}>{nextService?.name ?? "No session booked"}</Text>
              </View>
              <StatusBadge label={nextBooking?.status ?? "Open"} tone="success" />
            </View>
            {nextSlot ? (
              <>
                <Text style={styles.heroDate}>{formatShortDate(nextSlot.start)} · {formatTime(nextSlot.start)}</Text>
                <View style={styles.heroMetaRow}>
                  {nextCoach ? <Avatar initials={nextCoach.initials} accent={nextCoach.accent} size={34} /> : <View style={styles.metaIcon}><Text style={styles.metaIconText}>⌁</Text></View>}
                  <View style={{ flex: 1 }}><Text style={styles.heroMeta}>{nextCoach?.fullName ?? "Open gym access"}</Text><Text style={styles.heroMetaMuted}>{nextSlot.room} · {snapshot.gyms[0]?.name}</Text></View>
                  <Pressable onPress={() => router.push("/schedule")} style={styles.heroArrow} accessibilityRole="button" accessibilityLabel="View upcoming booking"><Text style={styles.heroArrowText}>→</Text></Pressable>
                </View>
              </>
            ) : <Text style={styles.heroEmpty}>Choose a session that fits your week.</Text>}
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable onPress={() => router.push("/book")} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.primary }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Book a session">
            <Text style={styles.actionIcon}>＋</Text><Text style={styles.actionTitle}>Book a session</Text><Text style={styles.actionSubtitle}>Find your next hour</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/schedule")} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Open my schedule">
            <Text style={[styles.actionIcon, { color: colors.primary }]}>◷</Text><Text style={[styles.actionTitle, { color: colors.foreground }]}>My schedule</Text><Text style={[styles.actionSubtitle, { color: colors.muted }]}>{upcomingBookings.length} upcoming</Text>
          </Pressable>
        </View>

        <SectionTitle title="This week" action="View history" onAction={() => router.push("/history")} />
        <SurfaceCard style={styles.statsCard}>
          <View style={styles.stat}><Text style={[styles.statValue, { color: colors.foreground }]}>03</Text><Text style={[styles.statLabel, { color: colors.muted }]}>Sessions</Text></View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}><Text style={[styles.statValue, { color: colors.foreground }]}>02</Text><Text style={[styles.statLabel, { color: colors.muted }]}>Check-ins</Text></View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}><Text style={[styles.statValue, { color: colors.primary }]}>67%</Text><Text style={[styles.statLabel, { color: colors.muted }]}>Goal pace</Text></View>
        </SurfaceCard>

        <SectionTitle title="Latest from the gym" action="All updates" onAction={() => router.push("/notifications")} />
        <SurfaceCard style={styles.announcementCard} onPress={() => router.push("/notifications")} accessibilityLabel="Open latest gym announcement">
          <View style={styles.announcementTop}><StatusBadge label={announcement?.priority ?? "Normal"} tone="accent" /><Text style={[styles.announcementTime, { color: colors.muted }]}>Today</Text></View>
          <Text style={[styles.announcementTitle, { color: colors.foreground }]}>{announcement?.title ?? "You’re all set"}</Text>
          <Text style={[styles.announcementMessage, { color: colors.muted }]}>{announcement?.message ?? "Your gym updates will appear here."}</Text>
        </SurfaceCard>

        <SurfaceCard style={styles.membershipCard}>
          <View style={styles.membershipCopy}><Text style={[styles.membershipLabel, { color: colors.muted }]}>MEMBERSHIP</Text><Text style={[styles.membershipTitle, { color: colors.foreground }]}>{snapshot.member.membershipPlan}</Text><Text style={[styles.membershipExpiry, { color: colors.muted }]}>Active · renews in 42 days</Text></View>
          <GhostButton title="View plan" onPress={() => router.push("/profile")} />
        </SurfaceCard>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 36, gap: 20 },
  heroWrap: { borderRadius: 28, overflow: "hidden", backgroundColor: "#0b1220", minHeight: 206, position: "relative" },
  heroGlow: { position: "absolute", width: 260, height: 260, borderRadius: 130, right: -70, top: -90, opacity: 0.32 },
  heroContent: { padding: 20, gap: 17 },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  heroEyebrow: { color: "#8fe7db", fontSize: 11, fontWeight: "800", letterSpacing: 1.6, marginBottom: 6 },
  heroTitle: { color: "#ffffff", fontSize: 24, fontWeight: "800", letterSpacing: -0.5, maxWidth: 220 },
  heroDate: { color: "#d9f8f3", fontSize: 14, fontWeight: "700" },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroMeta: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  heroMetaMuted: { color: "#9fb5bf", fontSize: 12, marginTop: 3 },
  heroArrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  heroArrowText: { color: "#ffffff", fontSize: 21 },
  heroEmpty: { color: "#b5cbd0", lineHeight: 21 },
  metaIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#21404a", alignItems: "center", justifyContent: "center" },
  metaIconText: { color: "#8fe7db", fontSize: 18 },
  actionRow: { flexDirection: "row", gap: 12 },
  actionCard: { flex: 1, minHeight: 126, borderRadius: 22, borderWidth: 1, padding: 16, justifyContent: "space-between" },
  actionIcon: { color: "#ffffff", fontSize: 28, fontWeight: "300", lineHeight: 30 },
  actionTitle: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  actionSubtitle: { color: "rgba(255,255,255,0.68)", fontSize: 12, marginTop: 2 },
  statsCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: 18 },
  stat: { alignItems: "center", gap: 4, flex: 1 },
  statValue: { fontSize: 23, fontWeight: "800", letterSpacing: -0.4 },
  statLabel: { fontSize: 11, fontWeight: "700" },
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
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
