import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Avatar, GhostButton, PrimaryButton, ScreenHeader, SpectrumCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useGym } from "@/lib/gym-store";
import { createLocalDateRail, formatLocalClock, isSameLocalDay, isUpcomingAtLocalTime } from "@/lib/scheduler";
import { formatShortDate, formatTime, getCoach, getService, type TimeSlot } from "@/shared/gym";

export default function BookScreen() {
  const colors = useColors();
  const { snapshot, bookSlot } = useGym();
  const [now, setNow] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedService, setSelectedService] = useState("all");
  const [selectedCoach, setSelectedCoach] = useState("all");
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const days = createLocalDateRail(now, 7);
  const selectedDate = days[selectedDay] ?? days[0];
  const isToday = isSameLocalDay(selectedDate, now);
  const slots = useMemo(() => snapshot.slots.filter((slot) => {
    const start = new Date(slot.start);
    const sameDay = isSameLocalDay(start, selectedDate);
    return sameDay && slot.status === "Open" && isUpcomingAtLocalTime(slot.start, now) && (selectedService === "all" || slot.serviceTypeId === selectedService) && (selectedCoach === "all" || slot.coachId === selectedCoach);
  }).sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()), [snapshot.slots, selectedDate, now, selectedService, selectedCoach]);

  const handleBook = async () => {
    if (!selectedSlot) return;
    setBusy(true);
    const result = await bookSlot(selectedSlot.id);
    setBusy(false);
    setSelectedSlot(null);
    Alert.alert(result.success ? "You’re booked" : "Couldn’t book that session", result.success ? result.message : result.error);
  };

  const resetToToday = () => {
    setNow(new Date());
    setSelectedDay(0);
  };

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Book a session" subtitle="Your schedule, in local time." label="AVAILABILITY" />
      <SpectrumCard style={styles.schedulerIntro} intensity="muted"><View style={styles.introRow}><View><Text style={styles.introEyebrow}>DEVICE CLOCK</Text><Text style={styles.introTitle}>{isToday ? "Today" : formatShortDate(selectedDate.toISOString())}</Text><Text style={styles.introMeta}>{formatLocalClock(now)} local time · Past start times are hidden</Text></View>{!isToday ? <Pressable onPress={resetToToday} style={styles.todayButton} accessibilityRole="button" accessibilityLabel="Return to today"><Text style={styles.todayText}>Today</Text></Pressable> : <StatusBadge label="Live" tone="success" />}</View></SpectrumCard>

      <FilterGroup label="SERVICE"><FilterPill label="All" active={selectedService === "all"} onPress={() => setSelectedService("all")} /><FilterPill label="Strength" active={selectedService === "service-strength"} onPress={() => setSelectedService("service-strength")} /><FilterPill label="Yoga" active={selectedService === "service-yoga"} onPress={() => setSelectedService("service-yoga")} /><FilterPill label="Open Gym" active={selectedService === "service-open"} onPress={() => setSelectedService("service-open")} /></FilterGroup>
      <FilterGroup label="COACH"><FilterPill label="Any coach" active={selectedCoach === "all"} onPress={() => setSelectedCoach("all")} /><FilterPill label="Maya Chen" active={selectedCoach === "coach-maya"} onPress={() => setSelectedCoach("coach-maya")} /><FilterPill label="Jordan Brooks" active={selectedCoach === "coach-jordan"} onPress={() => setSelectedCoach("coach-jordan")} /></FilterGroup>

      <View style={styles.dateHeader}><View><Text style={[styles.filterLabel, { color: colors.muted }]}>SELECT DATE</Text><Text style={[styles.dateCaption, { color: colors.foreground }]}>{isToday ? "Today’s availability" : formatShortDate(selectedDate.toISOString())}</Text></View><Text style={[styles.resultCount, { color: colors.muted }]}>{slots.length} open</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>{days.map((day, index) => {
        const active = selectedDay === index;
        const today = isSameLocalDay(day, now);
        return <Pressable key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`} onPress={() => setSelectedDay(index)} style={[styles.dateCard, { backgroundColor: active ? "#2b1f2a" : colors.surface, borderColor: active ? "#f04488" : colors.border }]} accessibilityRole="button" accessibilityLabel={`Select ${day.toDateString()}`}><Text style={[styles.dateWeekday, { color: active ? "#ff82b7" : colors.muted }]}>{today ? "TODAY" : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day).toUpperCase()}</Text><Text style={[styles.dateNumber, { color: active ? colors.foreground : colors.foreground }]}>{day.getDate()}</Text>{today ? <View style={styles.todayDot} /> : null}</Pressable>;
      })}</ScrollView>

      <View style={styles.listGap}>{slots.length === 0 ? <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{isToday ? "No more sessions today" : "No sessions match your filters"}</Text><Text style={[styles.emptyMessage, { color: colors.muted }]}>{isToday ? "All remaining sessions have started or are full. Pick another day to keep training." : "Try another coach, service, or day to see more availability."}</Text><GhostButton title={isToday ? "Browse tomorrow" : "Clear filters"} onPress={() => isToday ? setSelectedDay(Math.min(1, days.length - 1)) : (setSelectedService("all"), setSelectedCoach("all"))} /></SurfaceCard> : slots.map((slot) => {
        const service = getService(snapshot, slot.serviceTypeId);
        const coach = getCoach(snapshot, slot.coachId);
        const remaining = slot.maximumCapacity - slot.bookedCount;
        return <SurfaceCard key={slot.id} style={styles.slotCard} onPress={() => setSelectedSlot(slot)} accessibilityLabel={`Book ${service?.name ?? "session"} at ${formatTime(slot.start)}`}><View style={styles.slotTop}><View><Text style={[styles.slotTime, { color: colors.foreground }]}>{formatTime(slot.start)}</Text><Text style={[styles.slotEnd, { color: colors.muted }]}>{service?.durationMinutes} min · {slot.room}</Text></View><StatusBadge label={`${remaining} left`} tone={remaining <= 2 ? "warning" : "success"} /></View><View style={[styles.slotRule, { backgroundColor: colors.border }]} /><View style={styles.slotBottom}>{coach ? <Avatar initials={coach.initials} accent={coach.accent} size={34} /> : <View style={[styles.openGymIcon, { backgroundColor: "#282130" }]}><Text style={[styles.openGymText, { color: "#bba4ff" }]}>⌁</Text></View>}<View style={styles.slotCopy}><Text style={[styles.slotService, { color: colors.foreground }]}>{service?.name}</Text><Text style={[styles.slotCoach, { color: colors.muted }]}>{coach?.fullName ?? "Self-guided access"}</Text></View><Text style={[styles.slotArrow, { color: "#ff82b7" }]}>→</Text></View></SurfaceCard>;
      })}</View>
    </ScrollView>

    <Modal visible={Boolean(selectedSlot)} transparent animationType="slide" onRequestClose={() => setSelectedSlot(null)}><View style={styles.modalBackdrop}><View style={[styles.sheet, { backgroundColor: "#151518", borderColor: colors.border }]}><View style={styles.sheetHandle} /><Text style={styles.sheetEyebrow}>CONFIRM SESSION</Text><Text style={[styles.sheetTitle, { color: colors.foreground }]}>{selectedSlot ? getService(snapshot, selectedSlot.serviceTypeId)?.name : ""}</Text>{selectedSlot ? <><Text style={[styles.sheetDate, { color: colors.foreground }]}>{formatShortDate(selectedSlot.start)} · {formatTime(selectedSlot.start)}</Text><Text style={[styles.sheetMeta, { color: colors.muted }]}>{getCoach(snapshot, selectedSlot.coachId)?.fullName ?? "Open gym access"} · {selectedSlot.room}</Text><View style={[styles.policy, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.policyTitle, { color: colors.foreground }]}>Cancellation policy</Text><Text style={[styles.policyText, { color: colors.muted }]}>Free cancellation is available before the session cutoff. Your spot is reserved once you confirm.</Text></View></> : null}<View style={styles.sheetActions}><GhostButton title="Not now" onPress={() => setSelectedSlot(null)} /><View style={styles.confirmWrap}><PrimaryButton title={busy ? "Booking…" : "Confirm booking"} onPress={handleBook} disabled={busy} /></View></View></View></View></Modal>
  </ScreenContainer>;
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  const colors = useColors();
  return <View style={styles.filterBlock}><Text style={[styles.filterLabel, { color: colors.muted }]}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>{children}</ScrollView></View>;
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={[styles.pill, { backgroundColor: active ? "#2b1f2a" : colors.surface, borderColor: active ? "#f04488" : colors.border }]} accessibilityRole="button"><Text style={[styles.pillText, { color: active ? "#ff82b7" : colors.muted }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 18 },
  schedulerIntro: { minHeight: 104 },
  introRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  introEyebrow: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  introTitle: { color: "#ffffff", fontSize: 24, fontWeight: "800", marginTop: 4 },
  introMeta: { color: "rgba(255,255,255,0.78)", fontSize: 12, marginTop: 5 },
  todayButton: { backgroundColor: "rgba(13,13,15,0.22)", borderColor: "rgba(255,255,255,0.24)", borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  todayText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  filterBlock: { gap: 9 },
  filterLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  pills: { gap: 8, paddingRight: 18 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  pillText: { fontSize: 12, fontWeight: "800" },
  dateHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 2 },
  dateCaption: { fontSize: 16, fontWeight: "800", marginTop: 4 },
  resultCount: { fontSize: 12, fontWeight: "700" },
  dateStrip: { gap: 8, paddingRight: 18 },
  dateCard: { width: 66, height: 80, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 5 },
  dateWeekday: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  dateNumber: { fontSize: 22, fontWeight: "800" },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#ff82b7", position: "absolute", bottom: 9 },
  listGap: { gap: 11 },
  slotCard: { padding: 16, gap: 13 },
  slotTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  slotTime: { fontSize: 21, fontWeight: "800", letterSpacing: -0.45 },
  slotEnd: { fontSize: 12, marginTop: 4 },
  slotRule: { height: 1 },
  slotBottom: { flexDirection: "row", alignItems: "center", gap: 10 },
  slotCopy: { flex: 1, gap: 3 },
  slotService: { fontSize: 14, fontWeight: "800" },
  slotCoach: { fontSize: 12 },
  slotArrow: { fontSize: 22, fontWeight: "500" },
  openGymIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  openGymText: { fontSize: 18 },
  emptyCard: { padding: 22, gap: 10, alignItems: "flex-start" },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptyMessage: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.64)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderBottomWidth: 0, padding: 22, paddingBottom: 34, gap: 12 },
  sheetHandle: { alignSelf: "center", width: 42, height: 4, backgroundColor: "#4a4a52", borderRadius: 2, marginBottom: 8 },
  sheetEyebrow: { color: "#ff82b7", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  sheetTitle: { fontSize: 25, fontWeight: "800", letterSpacing: -0.5 },
  sheetDate: { fontSize: 15, fontWeight: "700" },
  sheetMeta: { fontSize: 13 },
  policy: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 5, marginTop: 6 },
  policyTitle: { fontSize: 13, fontWeight: "800" },
  policyText: { fontSize: 12, lineHeight: 18 },
  sheetActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 7 },
  confirmWrap: { flex: 1 },
});
