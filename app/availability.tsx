import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { GhostButton, PrimaryButton, ScreenHeader, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { generateAvailabilityIntervals } from "@/lib/availability-shifts";
import { haptic } from "@/lib/haptics";
import { useGym } from "@/lib/gym-store";
import { formatShortDate, formatTime, getCoach, getService, type AvailabilityCreateInput, type AvailabilityShift } from "@/shared/gym";

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
  const { user } = useAuth();
  const { snapshot, createAvailability, setAvailabilityStatus, releaseCancelledShift } = useGym();
  const role = user?.role ?? snapshot.member.role;
  const isAdmin = role === "admin";
  const isCoach = role === "coach";
  const [selectedCoachId, setSelectedCoachId] = useState(snapshot.coaches[0]?.id ?? "");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  const shifts = useMemo(() => snapshot.availabilityShifts
    .filter((shift) => (isAdmin ? shift.coachId === selectedCoachId : shift.coachId === "coach-maya"))
    .filter((shift) => new Date(shift.end).getTime() > Date.now())
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()), [isAdmin, selectedCoachId, snapshot.availabilityShifts]);

  const handleStatus = async (shift: AvailabilityShift, status: "Available" | "Blocked") => {
    setBusy(true);
    const result = await setAvailabilityStatus(shift.id, status);
    setBusy(false);
    if (result.success) haptic.success(); else haptic.error();
    Alert.alert(result.success ? "Shift updated" : "Couldn’t update shift", result.success ? result.message ?? "Your availability was updated." : result.error);
  };

  const handleRelease = async (shift: AvailabilityShift, release: "reopen" | "block") => {
    setBusy(true);
    const result = await releaseCancelledShift(shift.id, release);
    setBusy(false);
    if (result.success) haptic.success(); else haptic.error();
    Alert.alert(result.success ? "Shift updated" : "Couldn’t update shift", result.success ? result.message ?? "Your availability was updated." : result.error);
  };

  if (!isCoach && !isAdmin) {
    return (
      <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
        <View style={styles.restricted}>
          <ScreenHeader title="Availability" subtitle="Coach workspace" label="RESTRICTED" />
          <SurfaceCard style={styles.restrictedCard}>
            <Text style={[styles.restrictedTitle, { color: colors.foreground }]}>Coach access required</Text>
            <Text style={[styles.restrictedCopy, { color: colors.muted }]}>This area is for coaches. You can book an available coach time from Book.</Text>
            <PrimaryButton title="Browse sessions" onPress={() => router.replace("/(tabs)/book")} />
          </SurfaceCard>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <FlatList
        data={shifts}
        keyExtractor={(shift) => shift.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <View style={styles.header}>
            <ScreenHeader title="Availability" subtitle="Publish the times you are free to coach." label={isAdmin ? "ADMIN" : "COACH"} />
            {isAdmin ? <View style={styles.adminPicker}><Text style={[styles.fieldLabel, { color: colors.muted }]}>COACH</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coachRail}>{snapshot.coaches.map((coach) => <Pressable key={coach.id} onPress={() => setSelectedCoachId(coach.id)} style={({ pressed }) => [styles.coachPill, { backgroundColor: selectedCoachId === coach.id ? "#2b1f2a" : colors.surface, borderColor: selectedCoachId === coach.id ? "#f04488" : colors.border }, pressed && styles.pressed]} accessibilityRole="button"><Text style={[styles.coachPillText, { color: selectedCoachId === coach.id ? "#ff82b7" : colors.muted }]}>{coach.fullName}</Text></Pressable>)}</ScrollView></View> : null}
            <PrimaryButton title="Add availability" onPress={() => setShowCreate(true)} />
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>UPCOMING SHIFTS</Text>
          </View>
        )}
        ListEmptyComponent={<SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No shifts yet</Text><Text style={[styles.emptyCopy, { color: colors.muted }]}>Add a future time when members can book you.</Text><PrimaryButton title="Add availability" onPress={() => setShowCreate(true)} /></SurfaceCard>}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <ShiftCard shift={item} colors={colors} snapshot={snapshot} busy={busy} onBlock={() => handleStatus(item, "Blocked")} onReopen={() => handleStatus(item, "Available")} onRelease={(release) => handleRelease(item, release)} />}
      />
      <CreateShiftSheet visible={showCreate} coachId={selectedCoachId} snapshot={snapshot} busy={busy} onClose={() => setShowCreate(false)} onCreate={async (input) => { setBusy(true); const result = await createAvailability(input); setBusy(false); if (result.success) { haptic.success(); setShowCreate(false); Alert.alert("Availability published", result.message ?? "Members can now book this time."); } else { haptic.error(); Alert.alert("Couldn’t publish availability", result.error); } }} />
    </ScreenContainer>
  );
}

function ShiftCard({ shift, colors, snapshot, busy, onBlock, onReopen, onRelease }: { shift: AvailabilityShift; colors: ReturnType<typeof useColors>; snapshot: ReturnType<typeof useGym>["snapshot"]; busy: boolean; onBlock: () => void; onReopen: () => void; onRelease: (release: "reopen" | "block") => void }) {
  const coach = getCoach(snapshot, shift.coachId);
  const service = getService(snapshot, shift.serviceTypeId);
  const action = shift.status === "Available" ? <GhostButton title={busy ? "Updating…" : "Block time"} onPress={() => { if (!busy) onBlock(); }} /> : shift.status === "Blocked" ? <GhostButton title={busy ? "Updating…" : "Make available"} onPress={() => { if (!busy) onReopen(); }} /> : null;
  return (
    <SurfaceCard style={styles.shiftCard}>
      <View style={styles.shiftTop}><View style={styles.shiftCopy}><Text style={[styles.shiftDate, { color: colors.foreground }]}>{formatShortDate(shift.start)}</Text><Text style={[styles.shiftTime, { color: colors.foreground }]}>{formatTime(shift.start)}–{formatTime(shift.end)}</Text></View><StatusBadge label={shift.status} tone={shift.status === "Available" ? "success" : shift.status === "Booked" ? "accent" : shift.status === "Blocked" ? "warning" : "neutral"} /></View>
      <Text style={[styles.shiftMeta, { color: colors.muted }]}>{service?.name ?? "Coaching"}{coach ? ` · ${coach.fullName}` : ""} · {shift.location}</Text>
      {shift.status === "Cancelled" ? <View style={styles.releaseRow}><Text style={[styles.releaseCopy, { color: colors.muted }]}>The member cancelled. Choose what happens next.</Text><View style={styles.releaseActions}><GhostButton title="Keep blocked" onPress={() => { if (!busy) onRelease("block"); }} /><PrimaryButton title="Make available" onPress={() => onRelease("reopen")} disabled={busy} /></View></View> : action ? <View style={styles.cardAction}>{action}</View> : null}
    </SurfaceCard>
  );
}

function CreateShiftSheet({ visible, coachId, snapshot, busy, onClose, onCreate }: { visible: boolean; coachId: string; snapshot: ReturnType<typeof useGym>["snapshot"]; busy: boolean; onClose: () => void; onCreate: (input: AvailabilityCreateInput) => Promise<void> }) {
  const colors = useColors();
  const [today] = useState(() => new Date());
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index + 1)), [today]);
  const [date, setDate] = useState(() => localDayString(addDays(today, 1)));
  const [serviceTypeId, setServiceTypeId] = useState(snapshot.services[0]?.id ?? "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [showMore, setShowMore] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState<30 | 45 | 60 | 90>(60);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [location, setLocation] = useState("Studio A");
  const [note, setNote] = useState("");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const service = snapshot.services.find((item) => item.id === serviceTypeId);
  const duration = showMore ? durationMinutes : ((service?.durationMinutes ?? 60) as 30 | 45 | 60 | 90);
  const preview = useMemo(() => generateAvailabilityIntervals({ coachId, serviceTypeId, startDate: date, endDate: repeatWeekly ? localDayString(addDays(new Date(`${date}T12:00:00`), 21)) : undefined, startTime, endTime, durationMinutes: duration, breakMinutes: showMore ? breakMinutes : 0, weekdays: repeatWeekly ? [new Date(`${date}T12:00:00`).getDay()] : undefined, location, note }), [breakMinutes, coachId, date, duration, endTime, location, note, repeatWeekly, serviceTypeId, showMore, startTime]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <ScrollView style={[styles.sheet, { backgroundColor: "#151518", borderColor: colors.border }]} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetEyebrow}>PUBLISH FREE TIME</Text>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Add availability</Text>
          <Text style={[styles.sheetCopy, { color: colors.muted }]}>Choose four things. Members will see the time after you publish it.</Text>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>1. SERVICE</Text>
          <View style={styles.serviceList}>{snapshot.services.map((item) => { const active = serviceTypeId === item.id; return <Pressable key={item.id} onPress={() => setServiceTypeId(item.id)} style={({ pressed }) => [styles.serviceCard, { borderColor: active ? "#f04488" : colors.border, backgroundColor: active ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected: active }}><View style={styles.serviceInfo}><Text style={[styles.serviceName, { color: active ? "#ff82b7" : colors.foreground }]}>{item.name}</Text><Text style={[styles.serviceDescription, { color: colors.muted }]}>{item.durationMinutes} min · {item.description}</Text></View><Text style={[styles.serviceSelect, { color: active ? "#ff82b7" : colors.muted }]}>{active ? "Selected" : "Choose"}</Text></Pressable>; })}</View>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>2. DATE</Text>
          <FlatList horizontal data={dates} keyExtractor={(item) => item.toISOString()} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRail} renderItem={({ item }) => <Pressable onPress={() => setDate(localDayString(item))} style={({ pressed }) => [styles.datePill, { borderColor: date === localDayString(item) ? "#f04488" : colors.border, backgroundColor: date === localDayString(item) ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]} accessibilityRole="button"><Text style={[styles.datePillText, { color: date === localDayString(item) ? "#ff82b7" : colors.muted }]}>{new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric" }).format(item)}</Text></Pressable>} />
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>3. STARTS</Text>
          <TextInput value={startTime} onChangeText={setStartTime} placeholder="09:00" placeholderTextColor={colors.muted} style={[styles.fullInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel="Start time" />
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>4. ENDS</Text>
          <TextInput value={endTime} onChangeText={setEndTime} placeholder="12:00" placeholderTextColor={colors.muted} style={[styles.fullInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel="End time" />
          <Pressable onPress={() => setShowMore((value) => !value)} style={({ pressed }) => [styles.moreRow, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ expanded: showMore }}><View><Text style={[styles.moreTitle, { color: colors.foreground }]}>More options</Text><Text style={[styles.moreCopy, { color: colors.muted }]}>{showMore ? "Hide location, repeat, and timing options" : "Location, repeat, break, duration, and note"}</Text></View><Text style={styles.moreToggle}>{showMore ? "Hide" : "Show"}</Text></Pressable>
          {showMore ? <View style={styles.moreContent}><Field label="LOCATION" value={location} onChangeText={setLocation} /><View style={styles.timeRow}><NumberChoice label="DURATION" values={[30, 45, 60, 90]} selected={durationMinutes} onSelect={(value) => setDurationMinutes(value as 30 | 45 | 60 | 90)} /><NumberChoice label="BREAK" values={[0, 10, 15, 30]} selected={breakMinutes} onSelect={setBreakMinutes} /></View><Pressable onPress={() => setRepeatWeekly((value) => !value)} style={({ pressed }) => [styles.repeatRow, { borderColor: repeatWeekly ? "#f04488" : colors.border, backgroundColor: repeatWeekly ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]} accessibilityRole="switch" accessibilityState={{ checked: repeatWeekly }}><View><Text style={[styles.repeatTitle, { color: colors.foreground }]}>Repeat this day weekly</Text><Text style={[styles.repeatCopy, { color: colors.muted }]}>Creates the same time for four weeks.</Text></View><Text style={styles.moreToggle}>{repeatWeekly ? "On" : "Off"}</Text></Pressable><Field label="NOTE (OPTIONAL)" value={note} onChangeText={setNote} /></View> : null}
          <View style={[styles.preview, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[styles.previewLabel, { color: colors.muted }]}>READY TO PUBLISH</Text><Text style={[styles.previewValue, { color: colors.foreground }]}>{preview.length} shift{preview.length === 1 ? "" : "s"} · {duration} minutes each</Text></View>
          <View style={styles.sheetActions}><GhostButton title="Cancel" onPress={onClose} /><View style={styles.createAction}><PrimaryButton title={busy ? "Publishing…" : "Publish"} disabled={busy || !preview.length} onPress={() => onCreate({ coachId, serviceTypeId, startDate: date, endDate: repeatWeekly ? localDayString(addDays(new Date(`${date}T12:00:00`), 21)) : undefined, startTime, endTime, durationMinutes: duration, breakMinutes: showMore ? breakMinutes : 0, weekdays: repeatWeekly ? [new Date(`${date}T12:00:00`).getDay()] : undefined, location, note: note || undefined })} /></View></View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) { const colors = useColors(); return <View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} style={[styles.fullInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} placeholderTextColor={colors.muted} /></View>; }
function NumberChoice({ label, values, selected, onSelect }: { label: string; values: number[]; selected: number; onSelect: (value: number) => void }) { const colors = useColors(); return <View style={styles.numberChoice}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><View style={styles.numberOptions}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={({ pressed }) => [styles.numberOption, { borderColor: selected === value ? "#f04488" : colors.border, backgroundColor: selected === value ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><Text style={[styles.numberText, { color: selected === value ? "#ff82b7" : colors.muted }]}>{value}</Text></Pressable>)}</View></View>; }

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40 },
  header: { gap: 15, paddingBottom: 16 },
  adminPicker: { gap: 8 },
  coachRail: { gap: 8 },
  coachPill: { borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  coachPillText: { fontSize: 12, fontWeight: "800" },
  summaryRow: { borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryValue: { fontSize: 24, fontWeight: "900" },
  summaryLabel: { fontSize: 12, marginTop: 2 },
  listHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  filterLink: { fontSize: 12, fontWeight: "800" },
  separator: { height: 10 },
  shiftCard: { gap: 11, padding: 16 },
  shiftTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  shiftCopy: { flex: 1 },
  shiftDate: { fontSize: 16, fontWeight: "900" },
  shiftTime: { fontSize: 14, fontWeight: "800", marginTop: 4 },
  shiftMeta: { fontSize: 12, lineHeight: 18 },
  cardAction: { alignSelf: "flex-start", marginTop: 2 },
  releaseRow: { gap: 10, marginTop: 3 },
  releaseCopy: { fontSize: 12, lineHeight: 18 },
  releaseActions: { flexDirection: "row", gap: 9, alignItems: "center" },
  emptyCard: { gap: 10, padding: 20 },
  emptyTitle: { fontSize: 18, fontWeight: "900" },
  emptyCopy: { fontSize: 13, lineHeight: 19 },
  restricted: { paddingTop: 10, gap: 18 },
  restrictedCard: { gap: 12, padding: 19 },
  restrictedTitle: { fontSize: 20, fontWeight: "900" },
  restrictedCopy: { fontSize: 13, lineHeight: 20 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.68)" },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, maxHeight: "94%" },
  sheetContent: { padding: 20, gap: 12 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#555560", alignSelf: "center", marginBottom: 2 },
  sheetEyebrow: { color: "#ff82b7", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  sheetTitle: { fontSize: 25, fontWeight: "900", letterSpacing: -0.5 },
  sheetCopy: { fontSize: 12, lineHeight: 18 },
  fieldLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 2 },
  serviceList: { gap: 8 },
  serviceCard: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  serviceInfo: { flex: 1, gap: 3 },
  serviceName: { fontSize: 13, fontWeight: "900" },
  serviceDescription: { fontSize: 11, lineHeight: 16 },
  serviceSelect: { fontSize: 11, fontWeight: "800" },
  dateRail: { gap: 8, paddingRight: 14 },
  datePill: { borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  datePillText: { fontSize: 12, fontWeight: "800" },
  fullInput: { height: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, fontSize: 15, fontWeight: "700" },
  moreRow: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 3 },
  moreTitle: { fontSize: 14, fontWeight: "900" },
  moreCopy: { fontSize: 11, marginTop: 3 },
  moreToggle: { color: "#ff82b7", fontSize: 11, fontWeight: "900" },
  moreContent: { gap: 12 },
  field: { gap: 7 },
  timeRow: { flexDirection: "row", gap: 10 },
  numberChoice: { flex: 1, gap: 7 },
  numberOptions: { flexDirection: "row", gap: 4 },
  numberOption: { flex: 1, height: 38, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  numberText: { fontSize: 11, fontWeight: "800" },
  repeatRow: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  repeatTitle: { fontSize: 13, fontWeight: "900" },
  repeatCopy: { fontSize: 11, marginTop: 3 },
  preview: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 4 },
  previewLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  previewValue: { fontSize: 14, fontWeight: "900" },
  sheetActions: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 3 },
  createAction: { flex: 1 },
  pressed: { opacity: 0.76 },
});
