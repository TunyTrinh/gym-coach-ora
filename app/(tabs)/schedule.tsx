import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Avatar, GhostButton, PrimaryButton, ScreenHeader, SpectrumCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useGym } from "@/lib/gym-store";
import { formatShortDate, formatTime, getBookingSlot, getCoach, getService } from "@/shared/gym";

export default function ScheduleScreen() {
  const colors = useColors();
  const { snapshot, upcomingBookings, cancelBooking, checkInBooking } = useGym();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

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

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="My schedule" subtitle="A clear view of what’s next." label="YOUR RHYTHM" />
      <SpectrumCard style={styles.agendaCard} intensity="muted"><View><Text style={styles.agendaEyebrow}>UP NEXT</Text><Text style={styles.agendaValue}>{upcomingBookings.length}</Text><Text style={styles.agendaLabel}>{upcomingBookings.length === 1 ? "session booked" : "sessions booked"}</Text></View><View style={styles.agendaSide}><Text style={styles.agendaSideLabel}>LOCAL TIME</Text><Text style={styles.agendaTime}>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(now)}</Text></View></SpectrumCard>

      {upcomingBookings.length === 0 ? <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your schedule is open</Text><Text style={[styles.emptyMessage, { color: colors.muted }]}>Book a session when you’re ready to get moving.</Text><PrimaryButton title="Browse sessions" onPress={() => router.push("/book")} /></SurfaceCard> : upcomingBookings.map((booking) => {
        const slot = getBookingSlot(snapshot, booking);
        if (!slot) return null;
        const service = getService(snapshot, slot.serviceTypeId);
        const coach = getCoach(snapshot, slot.coachId);
        const minutesUntil = Math.round((new Date(slot.start).getTime() - now.getTime()) / 60_000);
        const checkInOpen = minutesUntil <= 30 && minutesUntil >= -30;
        return <SurfaceCard key={booking.id} style={styles.bookingCard}><View style={styles.bookingTop}><View><Text style={[styles.bookingDate, { color: "#ff82b7" }]}>{formatShortDate(slot.start).toUpperCase()}</Text><Text style={[styles.bookingTime, { color: colors.foreground }]}>{formatTime(slot.start)} <Text style={[styles.bookingDuration, { color: colors.muted }]}>· {service?.durationMinutes} min</Text></Text></View><StatusBadge label={booking.checkInTime ? "Checked in" : booking.status} tone={booking.checkInTime ? "success" : "accent"} /></View><View style={[styles.bookingRule, { backgroundColor: colors.border }]} /><View style={styles.bookingMain}>{coach ? <Avatar initials={coach.initials} accent={coach.accent} size={40} /> : <View style={styles.openIcon}><Text style={styles.openIconText}>⌁</Text></View>}<View style={styles.bookingCopy}><Text style={[styles.bookingService, { color: colors.foreground }]}>{service?.name}</Text><Text style={[styles.bookingCoach, { color: colors.muted }]}>{coach?.fullName ?? "Self-guided access"}</Text><Text style={[styles.bookingLocation, { color: colors.muted }]}>{slot.room} · Northstar Downtown</Text></View></View><View style={styles.actionRow}>{checkInOpen && !booking.checkInTime ? <View style={{ flex: 1 }}><PrimaryButton title="Check in" onPress={() => handleCheckIn(booking.id)} icon="checkmark.circle.fill" /></View> : <View style={styles.windowNote}><Text style={[styles.windowText, { color: colors.muted }]}>{booking.checkInTime ? "Check-in recorded" : `Check-in opens ${Math.max(1, minutesUntil - 30)} min before`}</Text></View>}<Pressable onPress={() => handleCancel(booking.id)} accessibilityRole="button" accessibilityLabel="Cancel booking" style={({ pressed }) => [styles.cancelButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.cancelText, { color: colors.error }]}>Cancel</Text></Pressable></View></SurfaceCard>;
      })}

      <SurfaceCard style={styles.calendarCard}><View style={styles.calendarTop}><View><Text style={[styles.calendarEyebrow, { color: "#a98af0" }]}>KEEP GOING</Text><Text style={[styles.calendarTitle, { color: colors.foreground }]}>Build your rhythm</Text></View><Text style={[styles.calendarCount, { color: "#ff82b7" }]}>{upcomingBookings.length}<Text style={{ color: colors.muted, fontSize: 13 }}> booked</Text></Text></View><Text style={[styles.calendarMessage, { color: colors.muted }]}>A consistent schedule makes showing up easier. Browse sessions across the next seven local days.</Text><GhostButton title="Find another session" onPress={() => router.push("/book")} icon="calendar.badge.plus" /></SurfaceCard>
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 16 },
  agendaCard: { minHeight: 118 },
  agendaEyebrow: { color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  agendaValue: { color: "#ffffff", fontSize: 36, fontWeight: "800", letterSpacing: -1.1, marginTop: 4 },
  agendaLabel: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "700" },
  agendaSide: { position: "absolute", right: 18, bottom: 18, alignItems: "flex-end" },
  agendaSideLabel: { color: "rgba(255,255,255,0.68)", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  agendaTime: { color: "#ffffff", fontSize: 17, fontWeight: "800", marginTop: 4 },
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
  openIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#282130" },
  openIconText: { color: "#bba4ff", fontSize: 20 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  windowNote: { flex: 1, minHeight: 44, borderRadius: 14, justifyContent: "center", paddingHorizontal: 12, backgroundColor: "#151518" },
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
