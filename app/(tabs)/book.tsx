import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar, GhostButton, PrimaryButton, ScreenHeader, SpectrumCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { haptic } from "@/lib/haptics";
import { useGym } from "@/lib/gym-store";
import { useLanguage } from "@/lib/language-provider";
import { formatDateLocalized, formatTimeLocalized } from "@/lib/i18n";
import { createLocalDateRail, formatLocalClock, isSameLocalDay, isUpcomingAtLocalTime } from "@/lib/scheduler";
import { getCoach, getService, type TimeSlot } from "@/shared/gym";

export default function BookScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { snapshot, bookSlot } = useGym();
  const { language, t } = useLanguage();
  const role = user?.role ?? snapshot.member.role;
  const [now, setNow] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const days = createLocalDateRail(now, 7);
  const selectedDate = days[selectedDay] ?? days[0];
  const isToday = isSameLocalDay(selectedDate, now);
  const availableShiftIds = useMemo(
    () => new Set(snapshot.availabilityShifts.filter((shift) => shift.status === "Available" && isUpcomingAtLocalTime(shift.start, now)).map((shift) => shift.id)),
    [now, snapshot.availabilityShifts],
  );
  const availableDayKeys = useMemo(
    () => new Set(snapshot.availabilityShifts.filter((shift) => shift.status === "Available" && isUpcomingAtLocalTime(shift.start, now)).map((shift) => new Date(shift.start).toDateString())),
    [now, snapshot.availabilityShifts],
  );
  const slots = useMemo(
    () => snapshot.slots
      .filter((slot) => {
        const isCoachShift = Boolean(slot.coachId);
        const isAvailableCoachShift = !isCoachShift || Boolean(slot.availabilityShiftId && availableShiftIds.has(slot.availabilityShiftId));
        return isSameLocalDay(new Date(slot.start), selectedDate) && slot.status === "Open" && isAvailableCoachShift && isUpcomingAtLocalTime(slot.start, now);
      })
      .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()),
    [availableShiftIds, now, selectedDate, snapshot.slots],
  );

  const resetToToday = () => {
    setNow(new Date());
    setSelectedDay(0);
  };

  const handleBook = async () => {
    if (!selectedSlot) return;
    setBusy(true);
    const result = await bookSlot(selectedSlot.id);
    setBusy(false);
    setSelectedSlot(null);
    if (result.success) haptic.success(); else haptic.error();
    Alert.alert(result.success ? t("youreBooked") : t("couldntBook"), result.success ? result.message : result.error);
  };

  if (role !== "client") {
    return (
      <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
        <View style={styles.restricted}>
          <ScreenHeader title={t("staffTools")} subtitle={t("clientBookingHidden")} label={role === "admin" ? t("admin") : t("coachLabel")} />
          <SurfaceCard style={styles.restrictedCard}>
            <Text style={[styles.restrictedTitle, { color: colors.foreground }]}>{t("manageAvailability")}</Text>
            <Text style={[styles.restrictedCopy, { color: colors.muted }]}>{t("manageAvailabilityBody")}</Text>
            <PrimaryButton title={t("openCoachAvailability")} onPress={() => router.replace("/availability")} />
          </SurfaceCard>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <FlatList
        data={slots}
        keyExtractor={(slot) => slot.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <View style={styles.headerContent}>
            <ScreenHeader title={t("bookSessionTitle")} subtitle={t("bookSessionSubtitle")} label={t("book").toUpperCase()} />
            <SpectrumCard style={styles.clockCard} intensity="muted">
              <Text style={styles.clockEyebrow}>{t("yourLocalTime")}</Text>
              <View style={styles.clockRow}>
                <View>
                  <Text style={styles.clockTitle}>{isToday ? t("today") : formatDateLocalized(selectedDate.toISOString(), language)}</Text>
                  <Text style={styles.clockMeta}>{formatLocalClock(now)} · {t("pastTimesHidden").toLowerCase()}</Text>
                </View>
                {!isToday ? <Pressable onPress={resetToToday} style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]} accessibilityRole="button"><Text style={styles.todayText}>{t("today")}</Text></Pressable> : <StatusBadge label="Live" tone="success" />}
              </View>
            </SpectrumCard>
            <Text style={[styles.stepLabel, { color: colors.muted }]}>1. {t("chooseDay")}</Text>
            <FlatList
              horizontal
              data={days}
              keyExtractor={(day) => `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateStrip}
              renderItem={({ item: day, index }) => {
                const active = selectedDay === index;
                const today = isSameLocalDay(day, now);
                const hasCoachAvailability = availableDayKeys.has(day.toDateString());
                return (
                  <Pressable onPress={() => setSelectedDay(index)} style={({ pressed }) => [styles.dateCard, { backgroundColor: active ? "#2b1f2a" : colors.surface, borderColor: active ? "#f04488" : colors.border }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${t("choose")} ${formatDateLocalized(day.toISOString(), language)}${hasCoachAvailability ? `, ${t("available")}` : ""}`}>
                    <Text style={[styles.dateWeekday, { color: active ? "#ff82b7" : colors.muted }]}>{today ? t("today").toUpperCase() : new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", { weekday: "short" }).format(day).toUpperCase()}</Text>
                    <Text style={[styles.dateNumber, { color: colors.foreground }]}>{day.getDate()}</Text>
                    {today || hasCoachAvailability ? <View style={[styles.dateDot, hasCoachAvailability && !today ? styles.availabilityDot : null]} /> : null}
                  </Pressable>
                );
              }}
            />
            <View style={styles.timeHeading}>
              <Text style={[styles.stepLabel, { color: colors.muted }]}>2. {t("chooseTime")}</Text>
              <Text style={[styles.timeCount, { color: colors.muted }]}>{slots.length} {t("availableCount")}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{isToday ? t("noMoreSessionsToday") : t("nothingAvailableYet")}</Text><Text style={[styles.emptyMessage, { color: colors.muted }]}>{isToday ? t("chooseAnotherDay") : t("noSlotsAvailable")}</Text><GhostButton title={t("browseAnotherDay")} onPress={() => setSelectedDay(Math.min(selectedDay + 1, days.length - 1))} /></SurfaceCard>}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        renderItem={({ item: slot }) => <SlotCard slot={slot} colors={colors} snapshot={snapshot} language={language} t={t} onPress={() => setSelectedSlot(slot)} />}
      />
      <BookingSheet selectedSlot={selectedSlot} colors={colors} snapshot={snapshot} language={language} t={t} busy={busy} onClose={() => setSelectedSlot(null)} onBook={handleBook} />
    </ScreenContainer>
  );
}

function SlotCard({ slot, colors, snapshot, language, t, onPress }: { slot: TimeSlot; colors: ReturnType<typeof useColors>; snapshot: ReturnType<typeof useGym>["snapshot"]; language: "en" | "vi"; t: (key: any, params?: Record<string, string | number>) => string; onPress: () => void }) {
  const service = getService(snapshot, slot.serviceTypeId);
  const coach = getCoach(snapshot, slot.coachId);
  const remaining = slot.maximumCapacity - slot.bookedCount;
  return (
    <SurfaceCard style={styles.slotCard} onPress={onPress} accessibilityLabel={t("sessionWithCoach", { service: service?.name ?? t("sessionDefault"), coach: coach?.fullName ?? t("openGym"), time: formatTimeLocalized(slot.start, language) })}>
      <View style={styles.slotTop}>
        <View><Text style={[styles.slotTime, { color: colors.foreground }]}>{formatTimeLocalized(slot.start, language)}</Text><Text style={[styles.slotEnd, { color: colors.muted }]}>{service?.durationMinutes} {t("minutes")} · {slot.room}</Text></View>
        <StatusBadge label={`${remaining} ${t("left")}`} tone={remaining <= 2 ? "warning" : "success"} />
      </View>
      <View style={[styles.slotRule, { backgroundColor: colors.border }]} />
      <View style={styles.slotBottom}>
        {coach ? <Avatar initials={coach.initials} accent={coach.accent} size={36} /> : <View style={styles.openGymIcon}><Text style={styles.openGymText}>⌁</Text></View>}
        <View style={styles.slotCopy}><Text style={[styles.slotService, { color: colors.foreground }]}>{service?.name ?? t("openGym")}</Text><Text style={[styles.slotCoach, { color: colors.muted }]}>{coach?.fullName ?? t("selfGuidedAccess")}</Text></View>
        <Text style={styles.slotArrow}>→</Text>
      </View>
    </SurfaceCard>
  );
}

function BookingSheet({ selectedSlot, colors, snapshot, language, t, busy, onClose, onBook }: { selectedSlot: TimeSlot | null; colors: ReturnType<typeof useColors>; snapshot: ReturnType<typeof useGym>["snapshot"]; language: "en" | "vi"; t: (key: any, params?: Record<string, string | number>) => string; busy: boolean; onClose: () => void; onBook: () => void }) {
  const service = selectedSlot ? getService(snapshot, selectedSlot.serviceTypeId) : undefined;
  const coach = selectedSlot ? getCoach(snapshot, selectedSlot.coachId) : undefined;
  return (
    <Modal visible={Boolean(selectedSlot)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.sheet, { backgroundColor: "#151518", borderColor: colors.border }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetEyebrow}>{t("finalStep")}</Text>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{t("confirmYourSession")}</Text>
          {selectedSlot ? <>
            <Text style={[styles.sheetService, { color: colors.foreground }]}>{service?.name ?? t("sessionDefault")}</Text>
            <Text style={[styles.sheetDate, { color: colors.foreground }]}>{formatDateLocalized(selectedSlot.start, language)} · {formatTimeLocalized(selectedSlot.start, language)}–{formatTimeLocalized(selectedSlot.end, language)}</Text>
            <Text style={[styles.sheetMeta, { color: colors.muted }]}>{coach?.fullName ?? t("openGymAccess")} · {selectedSlot.room}</Text>
          </> : null}
          <Text style={[styles.policyText, { color: colors.muted }]}>{t("bookingPolicy")}</Text>
          <View style={styles.sheetActions}><GhostButton title={t("back")} onPress={onClose} /><View style={styles.confirmWrap}><PrimaryButton title={busy ? t("publishing") : t("confirmBookingTitle")} onPress={onBook} disabled={busy} /></View></View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40 },
  headerContent: { gap: 15, paddingBottom: 16 },
  clockCard: { minHeight: 108 },
  clockEyebrow: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  clockRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 5 },
  clockTitle: { color: "#ffffff", fontSize: 24, fontWeight: "800" },
  clockMeta: { color: "rgba(255,255,255,0.78)", fontSize: 12, marginTop: 4 },
  todayButton: { backgroundColor: "rgba(13,13,15,0.22)", borderColor: "rgba(255,255,255,0.24)", borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  todayText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  stepLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.25 },
  dateStrip: { gap: 8, paddingRight: 14 },
  dateCard: { width: 65, minHeight: 74, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 5 },
  dateWeekday: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  dateNumber: { fontSize: 22, fontWeight: "900" },
  dateDot: { position: "absolute", bottom: 8, width: 4, height: 4, borderRadius: 2, backgroundColor: "#ff82b7" },
  availabilityDot: { backgroundColor: "#32d77b" },
  timeHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 3 },
  timeCount: { fontSize: 12, fontWeight: "700" },
  itemSeparator: { height: 10 },
  slotCard: { gap: 12, padding: 16 },
  slotTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  slotTime: { fontSize: 22, fontWeight: "900" },
  slotEnd: { fontSize: 11, marginTop: 3 },
  slotRule: { height: 1 },
  slotBottom: { flexDirection: "row", alignItems: "center", gap: 10 },
  slotCopy: { flex: 1 },
  slotService: { fontSize: 14, fontWeight: "900" },
  slotCoach: { fontSize: 12, marginTop: 3 },
  slotArrow: { color: "#ff82b7", fontSize: 22, fontWeight: "500" },
  openGymIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(151,91,215,0.16)", alignItems: "center", justifyContent: "center" },
  openGymText: { color: "#b792ef", fontSize: 20 },
  emptyCard: { gap: 10, padding: 20 },
  emptyTitle: { fontSize: 18, fontWeight: "900" },
  emptyMessage: { fontSize: 13, lineHeight: 19 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.68)" },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, padding: 20, gap: 13 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#555560", alignSelf: "center", marginBottom: 2 },
  sheetEyebrow: { color: "#ff82b7", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  sheetTitle: { fontSize: 25, fontWeight: "900", letterSpacing: -0.5 },
  sheetService: { fontSize: 18, fontWeight: "900", marginTop: 4 },
  sheetDate: { fontSize: 14, fontWeight: "800", marginTop: 2 },
  sheetMeta: { fontSize: 13, marginTop: 2 },
  policyText: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  sheetActions: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 3 },
  confirmWrap: { flex: 1 },
  pressed: { opacity: 0.7 },
  restricted: { paddingTop: 10, gap: 18 },
  restrictedCard: { gap: 12, padding: 19 },
  restrictedTitle: { fontSize: 20, fontWeight: "900" },
  restrictedCopy: { fontSize: 13, lineHeight: 20 },
});
