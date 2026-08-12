import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Avatar, OfflineBanner, ScreenHeader, SpectrumCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useGym } from "@/lib/gym-store";
import { haptic } from "@/lib/haptics";
import { formatShortDate, formatTime, getBookingSlot, getCoach, getService } from "@/shared/gym";

import { useAuth } from "@/hooks/use-auth";

export default function HomeScreen() {
  const colors = useColors();
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const role = user?.role || "user";
  const { snapshot, upcomingBookings, unreadCount } = useGym();
  const nextBooking = upcomingBookings[0];
  const nextSlot = nextBooking ? getBookingSlot(snapshot, nextBooking) : undefined;
  const nextService = nextSlot ? getService(snapshot, nextSlot.serviceTypeId) : undefined;
  const nextCoach = nextSlot ? getCoach(snapshot, nextSlot.coachId) : undefined;
  const firstName = snapshot.member.fullName.split(" ")[0];
  const latestMeasurement = [...snapshot.measurements].sort((left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime())[0];
  const weight = latestMeasurement?.weightKg;

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={`Hi, ${firstName}`} subtitle={role === "coach" ? "Coach Dashboard" : role === "admin" ? "Admin Hub" : "Your next healthy move starts here."} onPress={() => router.push("/notifications")} badge={unreadCount} label={role === "coach" ? "COACH PORTAL" : role === "admin" ? "ADMIN PORTAL" : "GYMFLOW"} />
      <OfflineBanner label="Your schedule stays ready offline" />

      <>
        {role === "coach" && <SpectrumCard style={styles.heroCard} onPress={() => router.push("/schedule")} accessibilityLabel="View today's sessions">
          <View style={styles.heroTopRow}>
            <View style={styles.heroHeading}><Text style={styles.heroEyebrow}>COACH DASHBOARD</Text><Text style={styles.heroTitle}>Today's Sessions</Text></View>
            <StatusBadge label="Active" tone="success" />
          </View>
          <Text style={styles.heroDate}>Manage your client sessions and availability.</Text>
          <View style={styles.heroMetaRow}><View style={styles.metaIcon}><Text style={styles.metaIconText}>⌘</Text></View><View style={styles.heroCopy}><Text style={styles.heroMeta}>Client Management</Text><Text style={styles.heroMetaMuted}>View assigned health progress</Text></View><Text style={styles.heroArrow}>→</Text></View>
        </SpectrumCard>}

        {role === "admin" && <SpectrumCard style={styles.heroCard} onPress={() => router.push("/schedule")} accessibilityLabel="System overview">
          <View style={styles.heroTopRow}>
            <View style={styles.heroHeading}><Text style={styles.heroEyebrow}>ADMIN OVERVIEW</Text><Text style={styles.heroTitle}>Gym Operations</Text></View>
            <StatusBadge label="System OK" tone="success" />
          </View>
          <Text style={styles.heroDate}>Monitor bookings, coaches, and system health.</Text>
          <View style={styles.heroMetaRow}><View style={styles.metaIcon}><Text style={styles.metaIconText}>⚙</Text></View><View style={styles.heroCopy}><Text style={styles.heroMeta}>Global Settings</Text><Text style={styles.heroMetaMuted}>Manage roles and permissions</Text></View><Text style={styles.heroArrow}>→</Text></View>
        </SpectrumCard>}

        {role === "user" && <SpectrumCard style={styles.heroCard} onPress={() => router.push("/schedule")} accessibilityLabel="Open your next session">
          <View style={styles.heroTopRow}>
            <View style={styles.heroHeading}><Text style={styles.heroEyebrow}>{nextBooking ? "NEXT SESSION" : "YOUR NEXT MOVE"}</Text><Text style={styles.heroTitle}>{nextService?.name ?? "Ready when you are"}</Text></View>
            <StatusBadge label={nextBooking?.status ?? "Open"} tone={nextBooking ? "success" : "accent"} />
          </View>
          {nextSlot ? <>
            <Text style={styles.heroDate}>{formatShortDate(nextSlot.start)} · {formatTime(nextSlot.start)}</Text>
            <View style={styles.heroMetaRow}>{nextCoach ? <Avatar initials={nextCoach.initials} accent={nextCoach.accent} size={36} /> : <View style={styles.metaIcon}><Text style={styles.metaIconText}>⌁</Text></View>}<View style={styles.heroCopy}><Text style={styles.heroMeta}>{nextCoach?.fullName ?? "Open gym access"}</Text><Text style={styles.heroMetaMuted}>{nextSlot.room} · {snapshot.gyms[0]?.name}</Text></View><Text style={styles.heroArrow}>→</Text></View>
          </> : <Text style={styles.heroEmpty}>Choose a time that fits your day. Live availability is always shown in your local time.</Text>}
        </SpectrumCard>}
      </>

      <Pressable onPress={() => { haptic.light(); router.push("/book"); }} style={({ pressed }) => [styles.primaryAction, pressed && (reducedMotion ? styles.primaryReducedPressed : styles.primaryPressed)]} accessibilityRole="button" accessibilityLabel="Book a session">
        <View><Text style={styles.primaryEyebrow}>FIND YOUR TIME</Text><Text style={styles.primaryTitle}>Book a session</Text><Text style={styles.primaryCopy}>Browse upcoming coaching and gym slots</Text></View><View style={styles.primaryArrow}><Text style={styles.primaryArrowText}>+</Text></View>
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>TODAY AT A GLANCE</Text>
      <View style={styles.summaryRow}>
        <SurfaceCard style={styles.summaryCard} onPress={() => router.push("/schedule")} accessibilityLabel="Open your schedule"><Text style={[styles.summaryValue, { color: colors.foreground }]}>{upcomingBookings.length}</Text><Text style={[styles.summaryTitle, { color: colors.foreground }]}>Upcoming</Text><Text style={[styles.summaryCopy, { color: colors.muted }]}>{upcomingBookings.length === 1 ? "session planned" : "sessions planned"}</Text></SurfaceCard>
        <SurfaceCard style={styles.summaryCard} onPress={() => router.push("/progress")} accessibilityLabel="Open Health Progress"><Text style={[styles.summaryValue, { color: "#ff82b7" }]}>{typeof weight === "number" ? `${weight} kg` : "—"}</Text><Text style={[styles.summaryTitle, { color: colors.foreground }]}>Progress</Text><Text style={[styles.summaryCopy, { color: colors.muted }]}>{latestMeasurement ? "Latest check-in" : "Add a check-in"}</Text></SurfaceCard>
      </View>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 38, gap: 18 },
  heroCard: { minHeight: 206 },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  heroHeading: { flex: 1 },
  heroEyebrow: { color: "rgba(255,255,255,0.76)", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 6 },
  heroTitle: { color: "#ffffff", fontSize: 25, fontWeight: "800", letterSpacing: -0.65 },
  heroDate: { color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: "800", marginTop: 19 },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  heroCopy: { flex: 1 }, heroMeta: { color: "#ffffff", fontSize: 14, fontWeight: "800" }, heroMetaMuted: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 3 },
  heroArrow: { color: "#ffffff", fontSize: 24, fontWeight: "400", paddingHorizontal: 5 },
  heroEmpty: { color: "rgba(255,255,255,0.82)", fontSize: 13, lineHeight: 20, marginTop: 19, maxWidth: 260 },
  metaIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(13,13,15,0.2)", alignItems: "center", justifyContent: "center" }, metaIconText: { color: "#ffffff", fontSize: 18 },
  primaryAction: { minHeight: 116, borderRadius: 24, backgroundColor: "#26222b", borderWidth: 1, borderColor: "rgba(255,130,183,0.42)", paddingHorizontal: 19, paddingVertical: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  primaryEyebrow: { color: "#ff82b7", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }, primaryTitle: { color: "#ffffff", fontSize: 20, fontWeight: "900", letterSpacing: -0.35, marginTop: 5 }, primaryCopy: { color: "#b4b4bd", fontSize: 12, marginTop: 4 },
  primaryArrow: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#f04488" }, primaryArrowText: { color: "#ffffff", fontSize: 26, fontWeight: "300", lineHeight: 30 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginLeft: 2, marginTop: 4 },
  summaryRow: { flexDirection: "row", gap: 11 }, summaryCard: { flex: 1, minHeight: 118, justifyContent: "space-between", padding: 16 }, summaryValue: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 }, summaryTitle: { fontSize: 14, fontWeight: "800", marginTop: 10 }, summaryCopy: { fontSize: 11, marginTop: 3 },
  primaryPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] }, primaryReducedPressed: { opacity: 0.78 },
});
