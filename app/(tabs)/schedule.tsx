import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { Avatar, PrimaryButton, ScreenHeader, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { addMonths, buildMonthGrid, isSameLocalDay, localDayKey, startOfLocalDay, startOfMonth } from "@/lib/calendar";
import { useGym } from "@/lib/gym-store";
import { useLanguage } from "@/lib/language-provider";
import { formatDateLocalized, formatTimeLocalized, localeFor } from "@/lib/i18n";
import { getBookingSlot, getCoach, getService } from "@/shared/gym";

const weekDayReference = new Date(2024, 0, 7);

export default function ScheduleScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { snapshot, upcomingBookings, cancelBooking, checkInBooking } = useGym();
  const { language, t } = useLanguage();
  const role = user?.role ?? snapshot.member.role;
  const [now, setNow] = useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const calendarDays = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const bookingsByDay = useMemo(() => {
    const result = new Map<string, typeof upcomingBookings>();
    upcomingBookings.forEach((booking) => {
      const slot = getBookingSlot(snapshot, booking);
      if (!slot) return;
      const key = localDayKey(slot.start);
      result.set(key, [...(result.get(key) ?? []), booking]);
    });
    return result;
  }, [snapshot, upcomingBookings]);
  const selectedBookings = bookingsByDay.get(localDayKey(selectedDate)) ?? [];
  const monthTitle = new Intl.DateTimeFormat(localeFor(language), { month: "long", year: "numeric" }).format(visibleMonth);
  const selectedTitle = isSameLocalDay(selectedDate, now)
    ? t("today")
    : formatDateLocalized(selectedDate, language, { weekday: "long", month: "long", day: "numeric" });
  const weekDays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(localeFor(language), { weekday: "short" }).format(new Date(weekDayReference.getTime() + index * 86_400_000)));

  const handleCancel = (bookingId: string) => {
    Alert.alert(t("cancelBookingPrompt"), t("cancelBookingBody"), [
      { text: t("keepBooking"), style: "cancel" },
      { text: t("cancelBooking"), style: "destructive", onPress: async () => {
        const result = await cancelBooking(bookingId, "Plans changed");
        Alert.alert(result.success ? t("bookingCancelled") : t("couldNotCancel"), result.success ? result.message : result.error);
      } },
    ]);
  };

  const handleCheckIn = async (bookingId: string) => {
    const result = await checkInBooking(bookingId);
    Alert.alert(result.success ? t("checkedInAlert") : t("checkInUnavailable"), result.success ? result.message : result.error);
  };

  const resetToToday = () => {
    const today = startOfLocalDay(new Date());
    setSelectedDate(today);
    setVisibleMonth(startOfMonth(today));
  };

  if (role !== "client") {
    return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <View style={styles.staffRestricted}>
        <ScreenHeader title="Staff schedule" subtitle="Manage coaching time from the staff workspace." label={role === "admin" ? "ADMIN" : "COACH"} />
        <SurfaceCard style={styles.staffCard}>
          <Text style={[styles.staffTitle, { color: colors.foreground }]}>Coach schedule</Text>
          <Text style={[styles.staffCopy, { color: colors.muted }]}>Publish free time, block a shift, or review booked sessions.</Text>
          <PrimaryButton title="Open staff workspace" onPress={() => router.replace("/availability")} />
        </SurfaceCard>
      </View>
    </ScreenContainer>;
  }

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={t("scheduleTitle")} subtitle={t("scheduleSubtitle")} label={t("scheduleHeader")} />
      <SurfaceCard style={styles.calendarCard}>
        <View style={styles.monthHeader}>
          <View><Text style={[styles.monthEyebrow, { color: "#ff82b7" }]}>{t("monthView")}</Text><Text style={[styles.monthTitle, { color: colors.foreground }]}>{monthTitle}</Text></View>
          <View style={styles.monthActions}>
            <Pressable onPress={() => setVisibleMonth((month) => addMonths(month, -1))} accessibilityRole="button" accessibilityLabel={t("previous")} style={({ pressed }) => [styles.iconButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.iconButtonText, { color: colors.foreground }]}>‹</Text></Pressable>
            <Pressable onPress={resetToToday} accessibilityRole="button" style={({ pressed }) => [styles.todayButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.todayButtonText, { color: colors.foreground }]}>{t("today")}</Text></Pressable>
            <Pressable onPress={() => setVisibleMonth((month) => addMonths(month, 1))} accessibilityRole="button" accessibilityLabel={t("next")} style={({ pressed }) => [styles.iconButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.iconButtonText, { color: colors.foreground }]}>›</Text></Pressable>
          </View>
        </View>
        <View style={styles.weekRow}>{weekDays.map((day) => <Text key={day} style={[styles.weekDay, { color: colors.muted }]}>{day}</Text>)}</View>
        <View style={styles.grid}>{calendarDays.map((day) => {
          const key = localDayKey(day);
          const dayBookings = bookingsByDay.get(key) ?? [];
          const isSelected = isSameLocalDay(day, selectedDate);
          const isToday = isSameLocalDay(day, now);
          const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
          return <View key={key} style={styles.dayCell}><Pressable onPress={() => { setSelectedDate(startOfLocalDay(day)); if (!isCurrentMonth) setVisibleMonth(startOfMonth(day)); }} accessibilityRole="button" accessibilityLabel={`${day.toDateString()}${dayBookings.length ? `, ${dayBookings.length} booked session${dayBookings.length === 1 ? "" : "s"}` : ""}`} style={({ pressed }) => [styles.dayButton, isSelected && styles.selectedDay, isToday && !isSelected && { borderColor: "#975bd7", borderWidth: 1 }, pressed && styles.pressed]}><Text style={[styles.dayNumber, { color: isCurrentMonth ? colors.foreground : colors.muted }, isSelected && styles.selectedDayText]}>{day.getDate()}</Text>{dayBookings.length > 0 ? <View style={[styles.bookingDot, { backgroundColor: dayBookings.length > 1 ? "#ff82b7" : "#8a77ef" }]}><Text style={styles.bookingDotText}>{dayBookings.length}</Text></View> : <View style={styles.dotSpacer} />}</Pressable></View>;
        })}</View>
        <Text style={[styles.calendarHint, { color: colors.muted }]}>{t("calendarHint")}</Text>
      </SurfaceCard>

      <View style={styles.daySummaryHeader}><View><Text style={[styles.summaryEyebrow, { color: "#a98af0" }]}>{t("selectedDay")}</Text><Text style={[styles.summaryTitle, { color: colors.foreground }]}>{selectedTitle}</Text></View><Text style={[styles.summaryCount, { color: "#ff82b7" }]}>{selectedBookings.length} {selectedBookings.length === 1 ? t("session") : t("sessions")}</Text></View>

      {selectedBookings.length === 0 ? <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("nothingBooked")}</Text><Text style={[styles.emptyMessage, { color: colors.muted }]}>{t("chooseDayOrBook")}</Text><PrimaryButton title={t("browseSessions")} onPress={() => router.push("/book")} /></SurfaceCard> : selectedBookings.map((booking) => {
        const slot = getBookingSlot(snapshot, booking);
        if (!slot) return null;
        const service = getService(snapshot, slot.serviceTypeId);
        const coach = getCoach(snapshot, slot.coachId);
        const minutesUntil = Math.round((new Date(slot.start).getTime() - now.getTime()) / 60_000);
        const checkInOpen = minutesUntil <= 30 && minutesUntil >= -30;
        return <SurfaceCard key={booking.id} style={styles.bookingCard}><View style={styles.bookingTop}><View><Text style={[styles.bookingTime, { color: colors.foreground }]}>{formatTimeLocalized(slot.start, language)} <Text style={[styles.bookingDuration, { color: colors.muted }]}>· {service?.durationMinutes} {t("minutes")}</Text></Text><Text style={[styles.bookingDate, { color: "#ff82b7" }]}>{formatDateLocalized(slot.start, language, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</Text></View><StatusBadge label={booking.checkInTime ? t("checkedIn") : statusLabel(booking.status, t)} tone={booking.checkInTime ? "success" : "accent"} /></View><View style={[styles.bookingRule, { backgroundColor: colors.border }]} /><View style={styles.bookingMain}>{coach ? <Avatar initials={coach.initials} accent={coach.accent} size={40} /> : <View style={styles.openIcon}><Text style={styles.openIconText}>⌁</Text></View>}<View style={styles.bookingCopy}><Text style={[styles.bookingService, { color: colors.foreground }]}>{service?.name}</Text><Text style={[styles.bookingCoach, { color: colors.muted }]}>{coach?.fullName ?? t("selfGuidedAccess")}</Text><Text style={[styles.bookingLocation, { color: colors.muted }]}>{slot.room} · Northstar Downtown</Text></View></View><View style={styles.actionRow}>{checkInOpen && !booking.checkInTime ? <View style={styles.actionFill}><PrimaryButton title={t("checkIn")} onPress={() => handleCheckIn(booking.id)} icon="checkmark.circle.fill" /></View> : <View style={styles.windowNote}><Text style={[styles.windowText, { color: colors.muted }]}>{booking.checkInTime ? t("checkInRecorded") : `${t("checkInOpens")} ${Math.max(1, minutesUntil - 30)} ${t("minutes")} `}</Text></View>}<Pressable onPress={() => handleCancel(booking.id)} accessibilityRole="button" accessibilityLabel={t("cancelBooking")} style={({ pressed }) => [styles.cancelButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.cancelText, { color: colors.error }]}>{t("cancel")}</Text></Pressable></View></SurfaceCard>;
      })}
    </ScrollView>
  </ScreenContainer>;
}

function statusLabel(status: string, t: (key: any) => string) {
  if (status === "Completed") return t("completed");
  if (status === "Cancelled") return t("cancelled");
  if (status === "No-show") return t("noShow");
  if (status === "Booked") return t("booked");
  return status;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 16 },
  staffRestricted: { paddingTop: 10, gap: 18 }, staffCard: { gap: 12, padding: 19 }, staffTitle: { fontSize: 20, fontWeight: "900" }, staffCopy: { fontSize: 13, lineHeight: 20 },
  agendaCard: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 14 }, agendaCopy: { gap: 4, flex: 1 }, agendaEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4 }, agendaLabel: { fontSize: 16, fontWeight: "800" }, agendaToday: { minHeight: 38, borderRadius: 19, borderWidth: 1, justifyContent: "center", paddingHorizontal: 13 }, agendaTodayText: { color: "#ff82b7", fontSize: 12, fontWeight: "800" },
  calendarCard: { padding: 14, gap: 13 }, monthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }, monthEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, monthTitle: { fontSize: 19, fontWeight: "800", marginTop: 3 }, monthActions: { flexDirection: "row", alignItems: "center", gap: 6 }, iconButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" }, iconButtonText: { fontSize: 28, lineHeight: 28, marginTop: -3 }, todayButton: { height: 34, borderRadius: 17, borderWidth: 1, paddingHorizontal: 11, justifyContent: "center" }, todayButtonText: { fontSize: 11, fontWeight: "800" },
  weekRow: { flexDirection: "row" }, weekDay: { width: "14.285%", textAlign: "center", fontSize: 9, fontWeight: "800" }, grid: { flexDirection: "row", flexWrap: "wrap" }, dayCell: { width: "14.285%", aspectRatio: 0.86, padding: 2 }, dayButton: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 12 }, selectedDay: { backgroundColor: "#f04488" }, selectedDayText: { color: "#ffffff", fontWeight: "900" }, dayNumber: { fontSize: 13, fontWeight: "700" }, bookingDot: { minWidth: 14, height: 14, paddingHorizontal: 3, borderRadius: 7, alignItems: "center", justifyContent: "center", marginTop: 3 }, bookingDotText: { fontSize: 8, color: "#ffffff", fontWeight: "900" }, dotSpacer: { height: 14, marginTop: 3 }, calendarHint: { borderTopWidth: 1, borderTopColor: "#303036", paddingTop: 11, fontSize: 10, fontWeight: "700", textAlign: "center" },
  daySummaryHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 4 }, summaryEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, summaryTitle: { fontSize: 20, fontWeight: "800", marginTop: 3 }, summaryCount: { fontSize: 12, fontWeight: "800", marginBottom: 2 },
  bookingCard: { padding: 17, gap: 15 }, bookingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }, bookingTime: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 }, bookingDuration: { fontSize: 12, fontWeight: "600", letterSpacing: 0 }, bookingDate: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 4 }, bookingRule: { height: 1 }, bookingMain: { flexDirection: "row", alignItems: "center", gap: 11 }, bookingCopy: { flex: 1, gap: 3 }, bookingService: { fontSize: 15, fontWeight: "800" }, bookingCoach: { fontSize: 12 }, bookingLocation: { fontSize: 11, marginTop: 2 }, openIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#282130" }, openIconText: { color: "#bba4ff", fontSize: 20 }, actionRow: { flexDirection: "row", alignItems: "center", gap: 9 }, actionFill: { flex: 1 }, windowNote: { flex: 1, minHeight: 44, borderRadius: 14, justifyContent: "center", paddingHorizontal: 12, backgroundColor: "#151518" }, windowText: { fontSize: 11, fontWeight: "700", lineHeight: 16 }, cancelButton: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, justifyContent: "center" }, cancelText: { fontSize: 12, fontWeight: "800" },
  emptyCard: { padding: 22, gap: 10, alignItems: "flex-start" }, emptyTitle: { fontSize: 18, fontWeight: "800" }, emptyMessage: { fontSize: 13, lineHeight: 19, marginBottom: 4 }, pressed: { opacity: 0.7 },
});
