import { router } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Avatar, GhostButton, PrimaryButton, ScreenHeader, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useGym } from "@/lib/gym-store";
import { formatShortDate, formatTime, getBookingSlot, getCoach, getService } from "@/shared/gym";

export default function ScheduleScreen() {
  const colors = useColors();
  const { snapshot, upcomingBookings, cancelBooking, checkInBooking } = useGym();

  const handleCancel = (bookingId: string) => {
    Alert.alert("Cancel this booking?", "Your spot will be released immediately. Free cancellation applies before the session cutoff.", [
      { text: "Keep booking", style: "cancel" },
      { text: "Cancel booking", style: "destructive", onPress: async () => {
        const result = await cancelBooking(bookingId, "Plans changed");
        Alert.alert(result.success ? "Booking cancelled" : "Couldn’t cancel", result.success ? result.message : result.error);
      } },
    ]);
  };

  const handleCheckIn = async (bookingId: string) => {
    const result = await checkInBooking(bookingId);
    Alert.alert(result.success ? "Checked in" : "Check-in unavailable", result.success ? result.message : result.error);
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="My schedule" subtitle="Your week, at a glance." />
        <View style={[styles.agendaPill, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}26` }]}><Text style={[styles.agendaPillText, { color: colors.primary }]}>AGENDA VIEW</Text><Text style={[styles.agendaPillMeta, { color: colors.muted }]}>Tap a session for details</Text></View>

        {upcomingBookings.length === 0 ? <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your schedule is open</Text><Text style={[styles.emptyMessage, { color: colors.muted }]}>Book a session when you’re ready to get moving.</Text><PrimaryButton title="Browse sessions" onPress={() => router.push("/book")} /></SurfaceCard> : upcomingBookings.map((booking) => {
          const slot = getBookingSlot(snapshot, booking);
          if (!slot) return null;
          const service = getService(snapshot, slot.serviceTypeId);
          const coach = getCoach(snapshot, slot.coachId);
          const minutesUntil = Math.round((new Date(slot.start).getTime() - Date.now()) / 60_000);
          const checkInOpen = minutesUntil <= 30 && minutesUntil >= -30;
          return <SurfaceCard key={booking.id} style={styles.bookingCard}>
            <View style={styles.bookingTop}><View><Text style={[styles.bookingDate, { color: colors.primary }]}>{formatShortDate(slot.start).toUpperCase()}</Text><Text style={[styles.bookingTime, { color: colors.foreground }]}>{formatTime(slot.start)} <Text style={[styles.bookingDuration, { color: colors.muted }]}>· {service?.durationMinutes} min</Text></Text></View><StatusBadge label={booking.checkInTime ? "Checked in" : booking.status} tone={booking.checkInTime ? "success" : "accent"} /></View>
            <View style={[styles.bookingRule, { backgroundColor: colors.border }]} />
            <View style={styles.bookingMain}>{coach ? <Avatar initials={coach.initials} accent={coach.accent} size={40} /> : <View style={[styles.openIcon, { backgroundColor: `${colors.primary}15` }]}><Text style={[styles.openIconText, { color: colors.primary }]}>⌁</Text></View>}<View style={styles.bookingCopy}><Text style={[styles.bookingService, { color: colors.foreground }]}>{service?.name}</Text><Text style={[styles.bookingCoach, { color: colors.muted }]}>{coach?.fullName ?? "Self-guided access"}</Text><Text style={[styles.bookingLocation, { color: colors.muted }]}>{slot.room} · Northstar Downtown</Text></View></View>
            <View style={styles.actionRow}>{checkInOpen && !booking.checkInTime ? <View style={{ flex: 1 }}><PrimaryButton title="Check in" onPress={() => handleCheckIn(booking.id)} icon="checkmark.circle.fill" /></View> : <View style={[styles.windowNote, { backgroundColor: colors.background }]}><Text style={[styles.windowText, { color: colors.muted }]}>{booking.checkInTime ? "Check-in recorded" : `Check-in opens ${Math.max(1, minutesUntil - 30)} min before`}</Text></View>}<Pressable onPress={() => handleCancel(booking.id)} accessibilityRole="button" accessibilityLabel="Cancel booking" style={({ pressed }) => [styles.cancelButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.cancelText, { color: colors.error }]}>Cancel</Text></Pressable></View>
          </SurfaceCard>;
        })}

        <SurfaceCard style={styles.calendarCard}><View style={styles.calendarTop}><View><Text style={[styles.calendarEyebrow, { color: colors.primary }]}>THIS WEEK</Text><Text style={[styles.calendarTitle, { color: colors.foreground }]}>Build your rhythm</Text></View><Text style={[styles.calendarCount, { color: colors.foreground }]}>{upcomingBookings.length}<Text style={{ color: colors.muted, fontSize: 13 }}> booked</Text></Text></View><Text style={[styles.calendarMessage, { color: colors.muted }]}>A consistent schedule makes showing up easier. Browse open sessions for the next seven days.</Text><GhostButton title="Find another session" onPress={() => router.push("/book")} icon="calendar.badge.plus" /></SurfaceCard>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 16 },
  agendaPill: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  agendaPillText: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  agendaPillMeta: { fontSize: 12, fontWeight: "600" },
  bookingCard: { padding: 17, gap: 15 },
  bookingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  bookingDate: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  bookingTime: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5, marginTop: 4 },
  bookingDuration: { fontSize: 12, fontWeight: "600", letterSpacing: 0 },
  bookingRule: { height: 1 },
  bookingMain: { flexDirection: "row", alignItems: "center", gap: 11 },
  bookingCopy: { flex: 1, gap: 3 },
  bookingService: { fontSize: 15, fontWeight: "800" },
  bookingCoach: { fontSize: 12 },
  bookingLocation: { fontSize: 11, marginTop: 2 },
  openIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  openIconText: { fontSize: 20 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  windowNote: { flex: 1, minHeight: 44, borderRadius: 14, justifyContent: "center", paddingHorizontal: 12 },
  windowText: { fontSize: 11, fontWeight: "700", lineHeight: 16 },
  cancelButton: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, justifyContent: "center" },
  cancelText: { fontSize: 12, fontWeight: "800" },
  calendarCard: { gap: 12, marginTop: 2 },
  calendarTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calendarEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  calendarTitle: { fontSize: 18, fontWeight: "800", marginTop: 4 },
  calendarCount: { fontSize: 25, fontWeight: "800" },
  calendarMessage: { fontSize: 13, lineHeight: 20 },
  emptyCard: { padding: 22, gap: 10, alignItems: "flex-start" },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptyMessage: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  pressed: { opacity: 0.7 },
});
