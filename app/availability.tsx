import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { GhostButton, PrimaryButton, ScreenHeader, SpectrumCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { haptic } from "@/lib/haptics";
import { generateAvailabilityIntervals } from "@/lib/availability-shifts";
import { useGym } from "@/lib/gym-store";
import { formatShortDate, formatTime, getCoach, getService, type AvailabilityShift, type AvailabilityShiftStatus } from "@/shared/gym";

type ShiftFilter = "All" | AvailabilityShiftStatus;

function localDayString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export default function AvailabilityScreen() {
  const colors = useColors();
  const { snapshot, createAvailability, setAvailabilityStatus, releaseCancelledShift } = useGym();
  const role = snapshot.member.role;
  const isAdmin = role === "admin";
  const isCoach = role === "coach";
  const [selectedCoachId, setSelectedCoachId] = useState(snapshot.coaches[0]?.id ?? "");
  const [filter, setFilter] = useState<ShiftFilter>("All");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  const shifts = useMemo(() => snapshot.availabilityShifts
    .filter((shift) => (isAdmin ? shift.coachId === selectedCoachId : shift.coachId === "coach-maya"))
    .filter((shift) => filter === "All" || shift.status === filter)
    .filter((shift) => new Date(shift.end).getTime() > Date.now())
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()), [filter, isAdmin, selectedCoachId, snapshot.availabilityShifts]);
  const counts = useMemo(() => ({
    Available: shifts.filter((shift) => shift.status === "Available").length,
    Booked: shifts.filter((shift) => shift.status === "Booked").length,
    Blocked: shifts.filter((shift) => shift.status === "Blocked").length,
  }), [shifts]);

  const handleStatus = async (shift: AvailabilityShift, status: "Available" | "Blocked") => {
    setBusy(true);
    const result = await setAvailabilityStatus(shift.id, status);
    setBusy(false);
    if (result.success) haptic.success(); else haptic.error();
    Alert.alert(result.success ? "Availability updated" : "Couldn’t update shift", result.success ? result.message ?? "Your shift was updated." : result.error);
  };

  const handleRelease = async (shift: AvailabilityShift, release: "reopen" | "block") => {
    setBusy(true);
    const result = await releaseCancelledShift(shift.id, release);
    setBusy(false);
    if (result.success) haptic.success(); else haptic.error();
    Alert.alert(result.success ? "Released shift updated" : "Couldn’t update shift", result.success ? result.message ?? "Your availability was updated." : result.error);
  };

  if (!isCoach && !isAdmin) {
    return <ScreenContainer className="px-5" edges={["top", "left", "right"]}><View style={styles.restricted}><ScreenHeader title="Availability" subtitle="Coach workspace" label="RESTRICTED" /><SurfaceCard style={styles.restrictedCard}><Text style={[styles.restrictedTitle, { color: colors.foreground }]}>Coach access required</Text><Text style={[styles.restrictedCopy, { color: colors.muted }]}>Only coaches and admins can create, manage, or block coach availability. You can still book an available coach time from Book.</Text><PrimaryButton title="Browse sessions" onPress={() => router.replace("/(tabs)/book")} /></SurfaceCard></View></ScreenContainer>;
  }

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <FlatList
      data={shifts}
      keyExtractor={(shift) => shift.id}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<View style={styles.header}>
        <ScreenHeader title="Availability" subtitle="Create bookable coaching time and keep your calendar clear." label={isAdmin ? "ADMIN OVERSIGHT" : "COACH WORKSPACE"} />
        {isAdmin ? <FlatList horizontal data={snapshot.coaches} keyExtractor={(coach) => coach.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coachRail} renderItem={({ item: coach }) => <CoachPill coach={coach} active={selectedCoachId === coach.id} onPress={() => setSelectedCoachId(coach.id)} />} /> : null}
        <SpectrumCard style={styles.summaryCard} intensity="muted"><View style={styles.summaryTop}><View><Text style={styles.summaryEyebrow}>YOUR FUTURE TIME</Text><Text style={styles.summaryTitle}>{counts.Available} open shift{counts.Available === 1 ? "" : "s"}</Text></View><StatusBadge label="Live" tone="success" /></View><View style={styles.metrics}><Metric label="Available" value={counts.Available} /><Metric label="Booked" value={counts.Booked} /><Metric label="Blocked" value={counts.Blocked} /></View></SpectrumCard>
        <PrimaryButton title="Add availability" onPress={() => setShowCreate(true)} />
        <FlatList horizontal data={["All", "Available", "Booked", "Blocked", "Cancelled"] as ShiftFilter[]} keyExtractor={(item) => item} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail} renderItem={({ item }) => <FilterPill label={item} active={filter === item} onPress={() => setFilter(item)} />} />
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>FUTURE SHIFTS · {shifts.length}</Text>
      </View>}
      ListEmptyComponent={<SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No shifts to show</Text><Text style={[styles.emptyCopy, { color: colors.muted }]}>Add a future period to publish bookable coaching time. Blocked and cancelled periods remain visible through the status filters.</Text></SurfaceCard>}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => <ShiftCard shift={item} colors={colors} snapshot={snapshot} busy={busy} onBlock={() => handleStatus(item, "Blocked")} onReopen={() => handleStatus(item, "Available")} onRelease={(release) => handleRelease(item, release)} />}
    />
    <CreateShiftSheet visible={showCreate} coachId={selectedCoachId} snapshot={snapshot} busy={busy} onClose={() => setShowCreate(false)} onCreate={async (input) => { setBusy(true); const result = await createAvailability(input); setBusy(false); if (result.success) { haptic.success(); setShowCreate(false); Alert.alert("Availability published", result.message ?? "Your bookable shifts are ready."); } else { haptic.error(); Alert.alert("Couldn’t publish availability", result.error); } }} />
  </ScreenContainer>;
}

function CoachPill({ coach, active, onPress }: { coach: ReturnType<typeof useGym>["snapshot"]["coaches"][number]; active: boolean; onPress: () => void }) { const colors = useColors(); return <Pressable onPress={onPress} style={({ pressed }) => [styles.coachPill, { backgroundColor: active ? "#2b1f2a" : colors.surface, borderColor: active ? "#f04488" : colors.border }, pressed && styles.pressed]} accessibilityRole="button"><Text style={[styles.coachPillText, { color: active ? "#ff82b7" : colors.muted }]}>{coach.fullName}</Text></Pressable>; }

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { const colors = useColors(); return <Pressable onPress={onPress} style={({ pressed }) => [styles.filterPill, { backgroundColor: active ? "#2b1f2a" : colors.surface, borderColor: active ? "#f04488" : colors.border }, pressed && styles.pressed]} accessibilityRole="button"><Text style={[styles.filterText, { color: active ? "#ff82b7" : colors.muted }]}>{label}</Text></Pressable>; }

function Metric({ label, value }: { label: string; value: number }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

function ShiftCard({ shift, colors, snapshot, busy, onBlock, onReopen, onRelease }: { shift: AvailabilityShift; colors: ReturnType<typeof useColors>; snapshot: ReturnType<typeof useGym>["snapshot"]; busy: boolean; onBlock: () => void; onReopen: () => void; onRelease: (release: "reopen" | "block") => void }) {
  const coach = getCoach(snapshot, shift.coachId);
  const service = getService(snapshot, shift.serviceTypeId);
  const action = shift.status === "Available" ? <GhostButton title={busy ? "Updating…" : "Block"} onPress={() => { if (!busy) onBlock(); }} /> : shift.status === "Blocked" ? <GhostButton title={busy ? "Updating…" : "Re-open"} onPress={() => { if (!busy) onReopen(); }} /> : null;
  return <SurfaceCard style={styles.shiftCard}><View style={styles.shiftTop}><View style={styles.shiftCopy}><Text style={[styles.shiftDate, { color: colors.foreground }]}>{formatShortDate(shift.start)}</Text><Text style={[styles.shiftTime, { color: colors.foreground }]}>{formatTime(shift.start)}–{formatTime(shift.end)}</Text></View><StatusBadge label={shift.status} tone={shift.status === "Available" ? "success" : shift.status === "Booked" ? "accent" : shift.status === "Blocked" ? "warning" : "neutral"} /></View><View style={[styles.rule, { backgroundColor: colors.border }]} /><Text style={[styles.shiftMeta, { color: colors.muted }]}>{service?.name ?? "Coaching"} · {coach?.fullName ?? "Coach"} · {shift.location}</Text>{shift.note ? <Text style={[styles.shiftNote, { color: colors.muted }]}>{shift.note}</Text> : null}{shift.status === "Cancelled" ? <View style={styles.releaseRow}><Text style={[styles.releaseCopy, { color: colors.muted }]}>Client cancelled. Choose what happens next.</Text><View style={styles.releaseActions}><GhostButton title={busy ? "Updating…" : "Block"} onPress={() => { if (!busy) onRelease("block"); }} /><PrimaryButton title="Re-open" onPress={() => onRelease("reopen")} disabled={busy} /></View></View> : action ? <View style={styles.cardAction}>{action}</View> : null}</SurfaceCard>;
}

function CreateShiftSheet({ visible, coachId, snapshot, busy, onClose, onCreate }: { visible: boolean; coachId: string; snapshot: ReturnType<typeof useGym>["snapshot"]; busy: boolean; onClose: () => void; onCreate: (input: { coachId: string; serviceTypeId: string; startDate: string; endDate?: string; startTime: string; endTime: string; durationMinutes: 30 | 45 | 60 | 90; breakMinutes: number; weekdays?: number[]; location: string; note?: string }) => Promise<void> }) {
  const colors = useColors();
  const [today] = useState(() => new Date());
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index + 1)), [today]);
  const [date, setDate] = useState(() => localDayString(addDays(today, 1)));
  const [serviceTypeId, setServiceTypeId] = useState(snapshot.services[0]?.id ?? "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [durationMinutes, setDurationMinutes] = useState<30 | 45 | 60 | 90>(60);
  const [breakMinutes, setBreakMinutes] = useState(15);
  const [location, setLocation] = useState("Studio A");
  const [note, setNote] = useState("");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const preview = useMemo(() => generateAvailabilityIntervals({ coachId, serviceTypeId, startDate: date, endDate: repeatWeekly ? localDayString(addDays(new Date(`${date}T12:00:00`), 21)) : undefined, startTime, endTime, durationMinutes, breakMinutes, weekdays: repeatWeekly ? [new Date(`${date}T12:00:00`).getDay()] : undefined, location, note }), [breakMinutes, coachId, date, durationMinutes, endTime, location, note, repeatWeekly, serviceTypeId, startTime]);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><ScrollView style={[styles.sheet, { backgroundColor: "#151518", borderColor: colors.border }]} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}><View style={styles.sheetHandle} /><Text style={styles.sheetEyebrow}>COACH AVAILABILITY</Text><Text style={[styles.sheetTitle, { color: colors.foreground }]}>Add bookable time</Text><Text style={[styles.sheetCopy, { color: colors.muted }]}>Preview before publishing. Overlapping, past, and booked time is rejected automatically.</Text><Text style={[styles.fieldLabel, { color: colors.muted }]}>DATE</Text><FlatList horizontal data={dates} keyExtractor={(item) => item.toISOString()} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRail} renderItem={({ item }) => <Pressable onPress={() => setDate(localDayString(item))} style={({ pressed }) => [styles.datePill, { borderColor: date === localDayString(item) ? "#f04488" : colors.border, backgroundColor: date === localDayString(item) ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><Text style={[styles.datePillText, { color: date === localDayString(item) ? "#ff82b7" : colors.muted }]}>{new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric" }).format(item)}</Text></Pressable>} /><Text style={[styles.fieldLabel, { color: colors.muted }]}>SERVICE TYPE</Text><View style={styles.serviceList}>{snapshot.services.map((item) => { const active = serviceTypeId === item.id; return <Pressable key={item.id} onPress={() => setServiceTypeId(item.id)} style={({ pressed }) => [styles.serviceCard, { borderColor: active ? "#f04488" : colors.border, backgroundColor: active ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><View style={styles.serviceInfo}><Text style={[styles.serviceName, { color: active ? "#ff82b7" : colors.foreground }]}>{item.name}</Text><Text style={[styles.serviceDuration, { color: colors.muted }]}>{item.durationMinutes} min · {item.description ?? "Coaching session"}</Text></View><Text style={[styles.serviceRadio, { color: active ? "#ff82b7" : colors.muted }]}>{active ? "Selected" : "Select"}</Text></Pressable>; })}</View><View style={styles.timeRow}><Field label="START" value={startTime} onChangeText={setStartTime} /><Field label="END" value={endTime} onChangeText={setEndTime} /></View><View style={styles.timeRow}><NumberChoice label="SHIFT LENGTH" values={[30, 45, 60, 90]} selected={durationMinutes} onSelect={(value) => setDurationMinutes(value as 30 | 45 | 60 | 90)} /><NumberChoice label="BREAK" values={[0, 10, 15, 30]} selected={breakMinutes} onSelect={setBreakMinutes} /></View><Field label="LOCATION" value={location} onChangeText={setLocation} /><Field label="NOTE (OPTIONAL)" value={note} onChangeText={setNote} /><Text style={[styles.fieldLabel, { color: colors.muted }]}>REPEAT</Text><Pressable onPress={() => setRepeatWeekly((value) => !value)} style={({ pressed }) => [styles.repeatRow, { backgroundColor: repeatWeekly ? "#2b1f2a" : colors.surface, borderColor: repeatWeekly ? "#f04488" : colors.border }, pressed && styles.pressed]} accessibilityRole="switch" accessibilityState={{ checked: repeatWeekly }}><View><Text style={[styles.repeatTitle, { color: colors.foreground }]}>Repeat weekly</Text><Text style={[styles.repeatCopy, { color: colors.muted }]}>Creates this same day for the next four weeks.</Text></View><Text style={styles.repeatToggle}>{repeatWeekly ? "ON" : "OFF"}</Text></Pressable><View style={[styles.preview, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[styles.previewLabel, { color: colors.muted }]}>PREVIEW</Text><Text style={[styles.previewValue, { color: colors.foreground }]}>{preview.length} bookable shift{preview.length === 1 ? "" : "s"} · {durationMinutes} min each</Text></View><View style={styles.sheetActions}><GhostButton title="Cancel" onPress={onClose} /><View style={styles.createAction}><PrimaryButton title={busy ? "Publishing…" : "Publish shifts"} disabled={busy || !preview.length} onPress={() => onCreate({ coachId, serviceTypeId, startDate: date, endDate: repeatWeekly ? localDayString(addDays(new Date(`${date}T12:00:00`), 21)) : undefined, startTime, endTime, durationMinutes, breakMinutes, weekdays: repeatWeekly ? [new Date(`${date}T12:00:00`).getDay()] : undefined, location, note: note || undefined })} /></View></View></ScrollView></View></Modal>;
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) { const colors = useColors(); return <View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} placeholderTextColor={colors.muted} /></View>; }

function NumberChoice({ label, values, selected, onSelect }: { label: string; values: number[]; selected: number; onSelect: (value: number) => void }) { const colors = useColors(); return <View style={styles.numberChoice}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><View style={styles.numberOptions}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={({ pressed }) => [styles.numberOption, { borderColor: selected === value ? "#f04488" : colors.border, backgroundColor: selected === value ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><Text style={[styles.numberText, { color: selected === value ? "#ff82b7" : colors.muted }]}>{value}</Text></Pressable>)}</View></View>; }

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40 }, header: { gap: 15, paddingBottom: 16 }, coachRail: { gap: 8 }, coachPill: { borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 }, coachPillText: { fontSize: 12, fontWeight: "800" }, summaryCard: { minHeight: 150 }, summaryTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, summaryEyebrow: { color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 }, summaryTitle: { color: "#ffffff", fontSize: 23, fontWeight: "900", marginTop: 6 }, metrics: { flexDirection: "row", gap: 8, marginTop: 19 }, metric: { flex: 1, paddingTop: 11, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.22)" }, metricValue: { color: "#ffffff", fontSize: 20, fontWeight: "900" }, metricLabel: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "700", marginTop: 3 }, filterRail: { gap: 8, paddingRight: 16 }, filterPill: { borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 9 }, filterText: { fontSize: 12, fontWeight: "800" }, sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginTop: 3 }, separator: { height: 10 }, shiftCard: { gap: 12, padding: 16 }, shiftTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }, shiftCopy: { flex: 1 }, shiftDate: { fontSize: 16, fontWeight: "900" }, shiftTime: { fontSize: 13, fontWeight: "700", marginTop: 4 }, rule: { height: 1 }, shiftMeta: { fontSize: 12, lineHeight: 18 }, shiftNote: { fontSize: 12, lineHeight: 18 }, cardAction: { alignSelf: "flex-start", marginTop: 2 }, releaseRow: { gap: 10, marginTop: 3 }, releaseCopy: { fontSize: 12, lineHeight: 18 }, releaseActions: { flexDirection: "row", gap: 9, alignItems: "center" }, emptyCard: { gap: 9, padding: 19 }, emptyTitle: { fontSize: 17, fontWeight: "900" }, emptyCopy: { fontSize: 13, lineHeight: 19 }, restricted: { paddingTop: 10, gap: 18 }, restrictedCard: { gap: 12, padding: 19 }, restrictedTitle: { fontSize: 20, fontWeight: "900" }, restrictedCopy: { fontSize: 13, lineHeight: 20 }, modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.68)" }, sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, maxHeight: "94%" }, sheetContent: { padding: 20, gap: 13 }, sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#555560", alignSelf: "center", marginBottom: 2 }, sheetEyebrow: { color: "#ff82b7", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 }, sheetTitle: { fontSize: 25, fontWeight: "900", letterSpacing: -0.5 }, sheetCopy: { fontSize: 12, lineHeight: 18 }, fieldLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 2 }, dateRail: { gap: 8, paddingRight: 14 }, datePill: { borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 }, datePillText: { fontSize: 12, fontWeight: "800" }, timeRow: { flexDirection: "row", gap: 10 }, field: { flex: 1, gap: 7 }, input: { height: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, fontWeight: "700" }, numberChoice: { flex: 1, gap: 7 }, numberOptions: { flexDirection: "row", gap: 4 }, numberOption: { flex: 1, height: 38, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" }, numberText: { fontSize: 11, fontWeight: "800" }, repeatRow: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }, repeatTitle: { fontSize: 13, fontWeight: "900" }, repeatCopy: { fontSize: 11, marginTop: 3 }, repeatToggle: { color: "#ff82b7", fontSize: 11, fontWeight: "900" }, preview: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 4 }, previewLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1 }, previewValue: { fontSize: 14, fontWeight: "900" }, sheetActions: { flexDirection: "row", gap: 10, alignItems: "center" }, createAction: { flex: 1 },   pressed: { opacity: 0.78 },
  serviceList: { gap: 8 },
  serviceCard: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  serviceInfo: { flex: 1, gap: 3 },
  serviceName: { fontSize: 13, fontWeight: "900" },
  serviceDuration: { fontSize: 11, fontWeight: "600" },
  serviceRadio: { fontSize: 11, fontWeight: "800" },
});
