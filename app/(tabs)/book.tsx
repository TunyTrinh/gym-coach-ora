import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Avatar, GhostButton, PrimaryButton, ScreenHeader, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useGym } from "@/lib/gym-store";
import { formatShortDate, formatTime, getCoach, getService, type TimeSlot } from "@/shared/gym";

const makeDays = () => Array.from({ length: 7 }, (_, index) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + index);
  return date;
});

export default function BookScreen() {
  const colors = useColors();
  const { snapshot, bookSlot } = useGym();
  const days = useMemo(makeDays, []);
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedService, setSelectedService] = useState("all");
  const [selectedCoach, setSelectedCoach] = useState("all");
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [busy, setBusy] = useState(false);

  const slots = snapshot.slots.filter((slot) => {
    const start = new Date(slot.start);
    const selected = days[selectedDay];
    const sameDay = start.getFullYear() === selected.getFullYear() && start.getMonth() === selected.getMonth() && start.getDate() === selected.getDate();
    return sameDay && slot.status === "Open" && new Date(slot.start).getTime() > Date.now() && (selectedService === "all" || slot.serviceTypeId === selectedService) && (selectedCoach === "all" || slot.coachId === selectedCoach);
  });

  const handleBook = async () => {
    if (!selectedSlot) return;
    setBusy(true);
    const result = await bookSlot(selectedSlot.id);
    setBusy(false);
    setSelectedSlot(null);
    Alert.alert(result.success ? "You’re booked" : "Couldn’t book that session", result.success ? result.message : result.error);
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Book a session" subtitle="Find a time that fits your week." />

        <View style={styles.filterBlock}><Text style={[styles.filterLabel, { color: colors.muted }]}>SERVICE</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}><FilterPill label="All" active={selectedService === "all"} onPress={() => setSelectedService("all")} /><FilterPill label="Strength" active={selectedService === "service-strength"} onPress={() => setSelectedService("service-strength")} /><FilterPill label="Yoga" active={selectedService === "service-yoga"} onPress={() => setSelectedService("service-yoga")} /><FilterPill label="Open Gym" active={selectedService === "service-open"} onPress={() => setSelectedService("service-open")} /></ScrollView></View>

        <View style={styles.filterBlock}><Text style={[styles.filterLabel, { color: colors.muted }]}>COACH</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}><FilterPill label="Any coach" active={selectedCoach === "all"} onPress={() => setSelectedCoach("all")} /><FilterPill label="Maya Chen" active={selectedCoach === "coach-maya"} onPress={() => setSelectedCoach("coach-maya")} /><FilterPill label="Jordan Brooks" active={selectedCoach === "coach-jordan"} onPress={() => setSelectedCoach("coach-jordan")} /></ScrollView></View>

        <View style={styles.dateHeader}><Text style={[styles.filterLabel, { color: colors.muted }]}>DATE</Text><Text style={[styles.resultCount, { color: colors.muted }]}>{slots.length} available</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>
          {days.map((day, index) => <Pressable key={day.toISOString()} onPress={() => setSelectedDay(index)} style={[styles.dateCard, { backgroundColor: selectedDay === index ? colors.primary : colors.surface, borderColor: selectedDay === index ? colors.primary : colors.border }]} accessibilityRole="button" accessibilityLabel={`Select ${day.toDateString()}`}><Text style={[styles.dateWeekday, { color: selectedDay === index ? "#b6fff3" : colors.muted }]}>{index === 0 ? "TODAY" : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day).toUpperCase()}</Text><Text style={[styles.dateNumber, { color: selectedDay === index ? "#ffffff" : colors.foreground }]}>{day.getDate()}</Text></Pressable>)}
        </ScrollView>

        <View style={styles.listGap}>
          {slots.length === 0 ? <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No sessions match your filters</Text><Text style={[styles.emptyMessage, { color: colors.muted }]}>Try another coach, service, or day to see more availability.</Text><GhostButton title="Clear filters" onPress={() => { setSelectedService("all"); setSelectedCoach("all"); }} /></SurfaceCard> : slots.map((slot) => {
            const service = getService(snapshot, slot.serviceTypeId);
            const coach = getCoach(snapshot, slot.coachId);
            const remaining = slot.maximumCapacity - slot.bookedCount;
            return <SurfaceCard key={slot.id} style={styles.slotCard} onPress={() => setSelectedSlot(slot)} accessibilityLabel={`Book ${service?.name ?? "session"} at ${formatTime(slot.start)}`}>
              <View style={styles.slotTop}><View><Text style={[styles.slotTime, { color: colors.foreground }]}>{formatTime(slot.start)}</Text><Text style={[styles.slotEnd, { color: colors.muted }]}>{service?.durationMinutes} min · {slot.room}</Text></View><StatusBadge label={`${remaining} left`} tone={remaining <= 2 ? "warning" : "success"} /></View>
              <View style={styles.slotBottom}>{coach ? <Avatar initials={coach.initials} accent={coach.accent} size={32} /> : <View style={[styles.openGymIcon, { backgroundColor: `${colors.primary}18` }]}><Text style={[styles.openGymText, { color: colors.primary }]}>⌁</Text></View>}<View style={styles.slotCopy}><Text style={[styles.slotService, { color: colors.foreground }]}>{service?.name}</Text><Text style={[styles.slotCoach, { color: colors.muted }]}>{coach?.fullName ?? "Self-guided access"}</Text></View><Text style={[styles.slotArrow, { color: colors.primary }]}>→</Text></View>
            </SurfaceCard>;
          })}
        </View>
      </ScrollView>

      <Modal visible={Boolean(selectedSlot)} transparent animationType="slide" onRequestClose={() => setSelectedSlot(null)}>
        <View style={styles.modalBackdrop}><View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.sheetEyebrow, { color: colors.primary }]}>CONFIRM SESSION</Text>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{selectedSlot ? getService(snapshot, selectedSlot.serviceTypeId)?.name : ""}</Text>
          {selectedSlot ? <><Text style={[styles.sheetDate, { color: colors.foreground }]}>{formatShortDate(selectedSlot.start)} · {formatTime(selectedSlot.start)}</Text><Text style={[styles.sheetMeta, { color: colors.muted }]}>{getCoach(snapshot, selectedSlot.coachId)?.fullName ?? "Open gym access"} · {selectedSlot.room}</Text><View style={[styles.policy, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.policyTitle, { color: colors.foreground }]}>Cancellation policy</Text><Text style={[styles.policyText, { color: colors.muted }]}>Free cancellation is available before the session cutoff. Your spot is reserved once you confirm.</Text></View></> : null}
          <View style={styles.sheetActions}><GhostButton title="Not now" onPress={() => setSelectedSlot(null)} /><View style={{ flex: 1 }}><PrimaryButton title={busy ? "Booking…" : "Confirm booking"} onPress={handleBook} disabled={busy} /></View></View>
        </View></View>
      </Modal>
    </ScreenContainer>
  );
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={[styles.pill, { backgroundColor: active ? `${colors.primary}18` : colors.surface, borderColor: active ? colors.primary : colors.border }]} accessibilityRole="button"><Text style={[styles.pillText, { color: active ? colors.primary : colors.muted }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 18 },
  filterBlock: { gap: 9 },
  filterLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  pills: { gap: 8, paddingRight: 18 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  pillText: { fontSize: 12, fontWeight: "800" },
  dateHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  resultCount: { fontSize: 12, fontWeight: "700" },
  dateStrip: { gap: 8, paddingRight: 18 },
  dateCard: { width: 64, height: 76, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  dateWeekday: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  dateNumber: { fontSize: 22, fontWeight: "800" },
  listGap: { gap: 11 },
  slotCard: { padding: 16, gap: 15 },
  slotTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  slotTime: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  slotEnd: { fontSize: 12, marginTop: 4 },
  slotBottom: { flexDirection: "row", alignItems: "center", gap: 10 },
  slotCopy: { flex: 1, gap: 3 },
  slotService: { fontSize: 14, fontWeight: "800" },
  slotCoach: { fontSize: 12 },
  slotArrow: { fontSize: 22, fontWeight: "500" },
  openGymIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  openGymText: { fontSize: 18 },
  emptyCard: { padding: 22, gap: 10, alignItems: "flex-start" },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptyMessage: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(11,18,32,0.48)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34, gap: 12 },
  sheetHandle: { alignSelf: "center", width: 42, height: 4, backgroundColor: "#c2cecd", borderRadius: 2, marginBottom: 8 },
  sheetEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  sheetTitle: { fontSize: 25, fontWeight: "800", letterSpacing: -0.5 },
  sheetDate: { fontSize: 15, fontWeight: "700" },
  sheetMeta: { fontSize: 13 },
  policy: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 5, marginTop: 6 },
  policyTitle: { fontSize: 13, fontWeight: "800" },
  policyText: { fontSize: 12, lineHeight: 18 },
  sheetActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 7 },
});
