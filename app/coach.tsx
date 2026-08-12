import { router } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Avatar, GhostButton, PrimaryButton, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useGym } from "@/lib/gym-store";
import { formatShortDate, formatTime, getCoach, getService } from "@/shared/gym";

export default function CoachScreen() {
  const colors = useColors();
  const { snapshot, markAttendance } = useGym();
  const coachId = snapshot.member.role === "coach" ? "coach-maya" : undefined;
  const sessions = snapshot.slots.filter((slot) => slot.coachId && (!coachId || slot.coachId === coachId) && new Date(slot.start).getTime() > Date.now() && slot.status !== "Cancelled").slice(0, 5);
  const roleLabel = snapshot.member.role === "admin" ? "GYM ADMIN" : "COACH VIEW";

  return <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Go back"><IconSymbol name="chevron.left" size={20} color={colors.foreground} /></Pressable><View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: colors.primary }]}>{roleLabel}</Text><Text style={[styles.title, { color: colors.foreground }]}>Sessions</Text></View><StatusBadge label="Live" tone="success" /></View>
      <SurfaceCard style={[styles.summaryCard, { backgroundColor: colors.primary }]}><Text style={styles.summaryEyebrow}>TODAY’S FOCUS</Text><View style={styles.summaryRow}><View><Text style={styles.summaryValue}>{sessions.length}</Text><Text style={styles.summaryLabel}>upcoming sessions</Text></View><View style={styles.summaryIcon}><IconSymbol name="figure.strengthtraining.traditional" size={25} color="#b6fff3" /></View></View></SurfaceCard>
      <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Upcoming schedule</Text><Text style={[styles.sectionMeta, { color: colors.muted }]}>Next 7 days</Text></View>
      <View style={styles.list}>{sessions.length ? sessions.map((slot) => {
        const service = getService(snapshot, slot.serviceTypeId);
        const coach = getCoach(snapshot, slot.coachId);
        const attendees = snapshot.bookings.filter((booking) => booking.timeSlotId === slot.id && ["Confirmed", "Pending"].includes(booking.status));
        return <SurfaceCard key={slot.id} style={styles.sessionCard}><View style={styles.sessionTop}><View><Text style={[styles.sessionDate, { color: colors.primary }]}>{formatShortDate(slot.start).toUpperCase()}</Text><Text style={[styles.sessionTime, { color: colors.foreground }]}>{formatTime(slot.start)}</Text></View><StatusBadge label={`${attendees.length} attendee${attendees.length === 1 ? "" : "s"}`} tone="accent" /></View><View style={[styles.rule, { backgroundColor: colors.border }]} /><View style={styles.sessionMeta}><Avatar initials={coach?.initials ?? "GF"} accent={coach?.accent ?? "#b7e4dd"} size={34} /><View style={{ flex: 1 }}><Text style={[styles.serviceName, { color: colors.foreground }]}>{service?.name}</Text><Text style={[styles.serviceMeta, { color: colors.muted }]}>{slot.room} · capacity {slot.maximumCapacity}</Text></View></View>{attendees.length ? <View style={styles.attendees}>{attendees.map((booking) => <View key={booking.id} style={styles.attendeeRow}><Avatar initials="AM" accent="#b7e4dd" size={28} /><View style={{ flex: 1 }}><Text style={[styles.attendeeName, { color: colors.foreground }]}>Alex Morgan</Text><Text style={[styles.attendeeMeta, { color: colors.muted }]}>{booking.checkInTime ? "Checked in" : "Confirmed"}</Text></View>{booking.status === "Confirmed" ? <View style={styles.attendeeActions}><Pressable onPress={async () => { const result = await markAttendance(booking.id, "Completed"); Alert.alert(result.success ? "Attendance saved" : "Couldn’t save attendance", result.success ? result.message : result.error); }} style={[styles.attendanceButton, { backgroundColor: `${colors.success}18` }]} accessibilityRole="button" accessibilityLabel="Mark attendee completed"><Text style={[styles.attendanceButtonText, { color: colors.success }]}>Done</Text></Pressable><Pressable onPress={async () => { const result = await markAttendance(booking.id, "No-show"); Alert.alert(result.success ? "Attendance saved" : "Couldn’t save attendance", result.success ? result.message : result.error); }} style={[styles.attendanceButton, { backgroundColor: `${colors.error}14` }]} accessibilityRole="button" accessibilityLabel="Mark attendee no-show"><Text style={[styles.attendanceButtonText, { color: colors.error }]}>No-show</Text></Pressable></View> : <StatusBadge label={booking.status} tone={booking.status === "Completed" ? "success" : "error"} />}</View>)}</View> : <Text style={[styles.emptyAttendees, { color: colors.muted }]}>No attendees yet. You can share this session from the gym desk.</Text>}<GhostButton title="Message attendees" onPress={() => Alert.alert("Message attendees", "Your gym’s messaging endpoint will send this note to the session group.")} icon="bell.fill" /></SurfaceCard>;
      }) : <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No upcoming sessions</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Your assigned availability will appear here once the gym publishes it.</Text><PrimaryButton title="Back to profile" onPress={() => router.back()} /></SurfaceCard>}</View>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 3 },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  summaryCard: { gap: 11, marginTop: 4 },
  summaryEyebrow: { color: "#b6fff3", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryValue: { color: "#ffffff", fontSize: 34, fontWeight: "800", letterSpacing: -0.8 },
  summaryLabel: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "700" },
  summaryIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.13)", alignItems: "center", justifyContent: "center" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  sectionMeta: { fontSize: 12, fontWeight: "700" },
  list: { gap: 11 },
  sessionCard: { padding: 16, gap: 12 },
  sessionTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  sessionDate: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  sessionTime: { fontSize: 23, fontWeight: "800", marginTop: 4 },
  rule: { height: 1 },
  sessionMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  serviceName: { fontSize: 14, fontWeight: "800" },
  serviceMeta: { fontSize: 11, marginTop: 3 },
  attendees: { borderRadius: 15, padding: 11, backgroundColor: "rgba(128,151,155,0.08)", gap: 9 },
  attendeeRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  attendeeName: { fontSize: 12, fontWeight: "800" },
  attendeeMeta: { fontSize: 11, marginTop: 2 },
  attendeeActions: { flexDirection: "row", gap: 5 },
  attendanceButton: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 7 },
  attendanceButtonText: { fontSize: 10, fontWeight: "800" },
  emptyAttendees: { fontSize: 12, lineHeight: 18 },
  emptyCard: { padding: 22, gap: 9, alignItems: "flex-start" },
  emptyTitle: { fontSize: 17, fontWeight: "800" },
  emptyText: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
});
