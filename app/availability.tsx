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
import { useLanguage } from "@/lib/language-provider";
import { formatDateLocalized, formatTimeLocalized } from "@/lib/i18n";
import { getCoach, getService, type AvailabilityCreateInput, type AvailabilityShift } from "@/shared/gym";

function localDayString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const availabilityTimeOptions = Array.from({ length: 65 }, (_, index) => {
  const totalMinutes = 6 * 60 + index * 15;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
});

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatAvailabilityTime(value: string, language: "en" | "vi") {
  const minutes = timeToMinutes(value);
  if (minutes === null) return value;
  return formatTimeLocalized(new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60), language);
}

function localizeAvailabilityError(error: string | undefined, t: (key: any) => string) {
  if (!error) return t("couldNotPublish");
  if (error.includes("overlaps") || error.includes("overlap")) return t("availabilityConflict");
  if (error.includes("valid future period")) return t("completeShiftFits");
  if (error.includes("future")) return t("availabilityFuture");
  if (error.includes("selected service")) return t("serviceUnavailable");
  if (error.includes("valid coach")) return t("chooseCoachToPublish");
  return error;
}

export default function AvailabilityScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { snapshot, createAvailability, setAvailabilityStatus, releaseCancelledShift } = useGym();
  const { language, t } = useLanguage();
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
    Alert.alert(result.success ? t("shiftUpdated") : t("couldNotUpdateShift"), result.success ? result.message ?? t("availabilityUpdated") : result.error);
  };

  const handleRelease = async (shift: AvailabilityShift, release: "reopen" | "block") => {
    setBusy(true);
    const result = await releaseCancelledShift(shift.id, release);
    setBusy(false);
    if (result.success) haptic.success(); else haptic.error();
    Alert.alert(result.success ? t("shiftUpdated") : t("couldNotUpdateShift"), result.success ? result.message ?? t("availabilityUpdated") : result.error);
  };

  if (!isCoach && !isAdmin) {
    return (
      <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
        <View style={styles.restricted}>
          <ScreenHeader title={t("availability")} subtitle={t("coachWorkspace")} label={t("restricted")} />
          <SurfaceCard style={styles.restrictedCard}>
            <Text style={[styles.restrictedTitle, { color: colors.foreground }]}>{t("coachAccessRequired")}</Text>
            <Text style={[styles.restrictedCopy, { color: colors.muted }]}>{t("coachAccessBody")}</Text>
            <PrimaryButton title={t("browseSessions")} onPress={() => router.replace("/(tabs)/book")} />
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
            <ScreenHeader title={t("availability")} subtitle={t("availabilitySubtitle")} label={isAdmin ? t("admin") : t("coachLabel")} />
            {isAdmin ? <View style={styles.adminPicker}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("selectCoach")}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coachRail}>{snapshot.coaches.map((coach) => <Pressable key={coach.id} onPress={() => setSelectedCoachId(coach.id)} style={({ pressed }) => [styles.coachPill, { backgroundColor: selectedCoachId === coach.id ? "#2b1f2a" : colors.surface, borderColor: selectedCoachId === coach.id ? "#f04488" : colors.border }, pressed && styles.pressed]} accessibilityRole="button"><Text style={[styles.coachPillText, { color: selectedCoachId === coach.id ? "#ff82b7" : colors.muted }]}>{coach.fullName}</Text></Pressable>)}</ScrollView></View> : null}
            <PrimaryButton title={t("addAvailability")} onPress={() => setShowCreate(true)} />
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t("upcomingShifts")}</Text>
          </View>
        )}
        ListEmptyComponent={<SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noShiftsYet")}</Text><Text style={[styles.emptyCopy, { color: colors.muted }]}>{t("addFutureTime")}</Text><PrimaryButton title={t("addAvailability")} onPress={() => setShowCreate(true)} /></SurfaceCard>}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <ShiftCard shift={item} colors={colors} snapshot={snapshot} language={language} t={t} busy={busy} onBlock={() => handleStatus(item, "Blocked")} onReopen={() => handleStatus(item, "Available")} onRelease={(release) => handleRelease(item, release)} />}
      />
      <CreateShiftSheet visible={showCreate} coachId={selectedCoachId} snapshot={snapshot} language={language} t={t} busy={busy} onClose={() => setShowCreate(false)} onCreate={async (input) => { setBusy(true); const result = await createAvailability(input); setBusy(false); if (result.success) { haptic.success(); setShowCreate(false); Alert.alert(t("availabilityPublished"), result.message ?? t("membersCanBook")); } else { haptic.error(); Alert.alert(t("couldNotPublish"), localizeAvailabilityError(result.error, t)); } }} />
    </ScreenContainer>
  );
}

function ShiftCard({ shift, colors, snapshot, language, t, busy, onBlock, onReopen, onRelease }: { shift: AvailabilityShift; colors: ReturnType<typeof useColors>; snapshot: ReturnType<typeof useGym>["snapshot"]; language: "en" | "vi"; t: (key: any) => string; busy: boolean; onBlock: () => void; onReopen: () => void; onRelease: (release: "reopen" | "block") => void }) {
  const coach = getCoach(snapshot, shift.coachId);
  const service = getService(snapshot, shift.serviceTypeId);
  const action = shift.status === "Available" ? <GhostButton title={busy ? t("updating") : t("blockTime")} onPress={() => { if (!busy) onBlock(); }} /> : shift.status === "Blocked" ? <GhostButton title={busy ? t("updating") : t("makeAvailable")} onPress={() => { if (!busy) onReopen(); }} /> : null;
  return (
    <SurfaceCard style={styles.shiftCard}>
      <View style={styles.shiftTop}><View style={styles.shiftCopy}><Text style={[styles.shiftDate, { color: colors.foreground }]}>{formatDateLocalized(shift.start, language, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</Text><Text style={[styles.shiftTime, { color: colors.foreground }]}>{formatTimeLocalized(shift.start, language)}–{formatTimeLocalized(shift.end, language)}</Text></View><StatusBadge label={statusLabel(shift.status, t)} tone={shift.status === "Available" ? "success" : shift.status === "Booked" ? "accent" : shift.status === "Blocked" ? "warning" : "neutral"} /></View>
      <Text style={[styles.shiftMeta, { color: colors.muted }]}>{service?.name ?? "Coaching"}{coach ? ` · ${coach.fullName}` : ""} · {shift.location}</Text>
      {shift.status === "Cancelled" ? <View style={styles.releaseRow}><Text style={[styles.releaseCopy, { color: colors.muted }]}>{t("cancelledMemberChoice")}</Text><View style={styles.releaseActions}><GhostButton title={t("keepBlocked")} onPress={() => { if (!busy) onRelease("block"); }} /><PrimaryButton title={t("makeAvailable")} onPress={() => onRelease("reopen")} disabled={busy} /></View></View> : action ? <View style={styles.cardAction}>{action}</View> : null}
    </SurfaceCard>
  );
}

function CreateShiftSheet({ visible, coachId, snapshot, language, t, busy, onClose, onCreate }: { visible: boolean; coachId: string; snapshot: ReturnType<typeof useGym>["snapshot"]; language: "en" | "vi"; t: (key: any) => string; busy: boolean; onClose: () => void; onCreate: (input: AvailabilityCreateInput) => Promise<void> }) {
  const colors = useColors();
  const [today] = useState(() => new Date());
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index + 1)), [today]);
  const [date, setDate] = useState(() => localDayString(addDays(today, 1)));
  const [serviceTypeId, setServiceTypeId] = useState(snapshot.services[0]?.id ?? "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [activeTimeField, setActiveTimeField] = useState<"start" | "end" | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [location, setLocation] = useState("Studio A");
  const [note, setNote] = useState("");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const service = snapshot.services.find((item) => item.id === serviceTypeId);
  const duration = (service?.durationMinutes ?? 60) as 30 | 45 | 60 | 90;
  const preview = useMemo(() => generateAvailabilityIntervals({ coachId, serviceTypeId, startDate: date, endDate: repeatWeekly ? localDayString(addDays(new Date(`${date}T12:00:00`), 21)) : undefined, startTime, endTime, durationMinutes: duration, breakMinutes: 0, weekdays: repeatWeekly ? [new Date(`${date}T12:00:00`).getDay()] : undefined, location, note }), [coachId, date, duration, endTime, location, note, repeatWeekly, serviceTypeId, startTime]);

  const handlePublish = () => {
    if (!serviceTypeId) {
      Alert.alert(t("couldNotPublish"), t("chooseServiceToPublish"));
      haptic.error();
      return;
    }
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    if (startMinutes === null || endMinutes === null) {
      Alert.alert(t("couldNotPublish"), t("chooseValidTime"));
      haptic.error();
      return;
    }
    if (endMinutes <= startMinutes) {
      Alert.alert(t("couldNotPublish"), t("endAfterStart"));
      haptic.error();
      return;
    }
    if (!preview.length) {
      Alert.alert(t("couldNotPublish"), t("completeShiftFits"));
      haptic.error();
      return;
    }
    void onCreate({ coachId, serviceTypeId, startDate: date, endDate: repeatWeekly ? localDayString(addDays(new Date(`${date}T12:00:00`), 21)) : undefined, startTime, endTime, durationMinutes: duration, breakMinutes: 0, weekdays: repeatWeekly ? [new Date(`${date}T12:00:00`).getDay()] : undefined, location, note: note || undefined });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <ScrollView style={[styles.sheet, { backgroundColor: "#151518", borderColor: colors.border }]} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetEyebrow}>{t("publishFreeTime")}</Text>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{t("addAvailability")}</Text>
          <Text style={[styles.sheetCopy, { color: colors.muted }]}>{t("chooseFourThings")}</Text>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>1. {t("service").toUpperCase()}</Text>
          <View style={styles.serviceList}>{snapshot.services.map((item) => { const active = serviceTypeId === item.id; return <Pressable key={item.id} onPress={() => setServiceTypeId(item.id)} style={({ pressed }) => [styles.serviceCard, { borderColor: active ? "#f04488" : colors.border, backgroundColor: active ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected: active }}><View style={styles.serviceInfo}><Text style={[styles.serviceName, { color: active ? "#ff82b7" : colors.foreground }]}>{item.name}</Text><Text style={[styles.serviceDescription, { color: colors.muted }]}>{item.durationMinutes} {t("minutes")} · {item.description}</Text></View><Text style={[styles.serviceSelect, { color: active ? "#ff82b7" : colors.muted }]}>{active ? t("selected") : t("choose")}</Text></Pressable>; })}</View>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>2. {t("measurementDate").toUpperCase()}</Text>
          <FlatList horizontal data={dates} keyExtractor={(item) => item.toISOString()} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRail} renderItem={({ item }) => <Pressable onPress={() => setDate(localDayString(item))} style={({ pressed }) => [styles.datePill, { borderColor: date === localDayString(item) ? "#f04488" : colors.border, backgroundColor: date === localDayString(item) ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]} accessibilityRole="button"><Text style={[styles.datePillText, { color: date === localDayString(item) ? "#ff82b7" : colors.muted }]}>{formatDateLocalized(item, language, { weekday: "short", day: "numeric" })}</Text></Pressable>} />
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>3. {t("starts")}</Text>
          <Pressable onPress={() => setActiveTimeField("start")} style={({ pressed }) => [styles.timeChoice, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={t("starts")}><Text style={[styles.timeChoiceValue, { color: colors.foreground }]}>{formatAvailabilityTime(startTime, language)}</Text><Text style={[styles.timeChoiceHint, { color: colors.muted }]}>{t("chooseTime")}</Text></Pressable>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>4. {t("ends")}</Text>
          <Pressable onPress={() => setActiveTimeField("end")} style={({ pressed }) => [styles.timeChoice, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={t("ends")}><Text style={[styles.timeChoiceValue, { color: colors.foreground }]}>{formatAvailabilityTime(endTime, language)}</Text><Text style={[styles.timeChoiceHint, { color: colors.muted }]}>{t("chooseTime")}</Text></Pressable>
          <Pressable onPress={() => setShowMore((value) => !value)} style={({ pressed }) => [styles.moreRow, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ expanded: showMore }}><View><Text style={[styles.moreTitle, { color: colors.foreground }]}>{t("moreOptions")}</Text><Text style={[styles.moreCopy, { color: colors.muted }]}>{showMore ? t("hideSchedulingOptions") : t("moreSchedulingOptions")}</Text></View><Text style={styles.moreToggle}>{showMore ? t("hide") : t("show")}</Text></Pressable>
          {showMore ? <View style={styles.moreContent}><Field label="LOCATION" value={location} onChangeText={setLocation} /><Pressable onPress={() => setRepeatWeekly((value) => !value)} style={({ pressed }) => [styles.repeatRow, { borderColor: repeatWeekly ? "#f04488" : colors.border, backgroundColor: repeatWeekly ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]} accessibilityRole="switch" accessibilityState={{ checked: repeatWeekly }}><View><Text style={[styles.repeatTitle, { color: colors.foreground }]}>{t("repeatThisDay")}</Text><Text style={[styles.repeatCopy, { color: colors.muted }]}>{t("repeatFourWeeks")}</Text></View><Text style={styles.moreToggle}>{repeatWeekly ? t("on") : t("off")}</Text></Pressable><Field label={t("noteOptional")} value={note} onChangeText={setNote} /></View> : null}
          <View style={[styles.preview, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[styles.previewLabel, { color: colors.muted }]}>{t("readyToPublish")}</Text><Text style={[styles.previewValue, { color: colors.foreground }]}>{preview.length ? `${preview.length} ${preview.length === 1 ? t("shift") : t("shifts")} · ${duration} ${t("minutes")} ${t("each")}` : t("completeShiftFits")}</Text></View>
          <View style={styles.sheetActions}><GhostButton title={t("cancel")} onPress={onClose} /><View style={styles.createAction}><PrimaryButton title={busy ? t("publishing") : t("publish")} disabled={busy} onPress={handlePublish} /></View></View>
        </ScrollView>
        {activeTimeField ? <View style={styles.timePickerBackdrop}><View style={[styles.timePickerSheet, { backgroundColor: "#151518", borderColor: colors.border }]}><Text style={styles.sheetEyebrow}>{t("chooseTime")}</Text><Text style={[styles.timePickerTitle, { color: colors.foreground }]}>{activeTimeField === "start" ? t("starts") : t("ends")}</Text><ScrollView style={styles.timeOptions} contentContainerStyle={styles.timeOptionsContent} showsVerticalScrollIndicator={false}>{availabilityTimeOptions.map((option) => { const active = option === (activeTimeField === "start" ? startTime : endTime); return <Pressable key={option} onPress={() => { if (activeTimeField === "start") setStartTime(option); else setEndTime(option); setActiveTimeField(null); }} style={({ pressed }) => [styles.timeOption, { borderColor: active ? "#f04488" : colors.border, backgroundColor: active ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected: active }}><Text style={[styles.timeOptionValue, { color: active ? "#ff82b7" : colors.foreground }]}>{formatAvailabilityTime(option, language)}</Text>{active ? <Text style={styles.timeOptionCheck}>✓</Text> : null}</Pressable>; })}</ScrollView><GhostButton title={t("close")} onPress={() => setActiveTimeField(null)} /></View></View> : null}
      </View>
    </Modal>
  );
}

function statusLabel(status: AvailabilityShift["status"], t: (key: any) => string) {
  if (status === "Available") return t("available");
  if (status === "Booked") return t("booked");
  if (status === "Blocked") return t("blocked");
  if (status === "Cancelled") return t("cancelled");
  return status;
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) { const colors = useColors(); return <View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} style={[styles.fullInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} placeholderTextColor={colors.muted} /></View>; }

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
  timeChoice: { height: 54, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timeChoiceValue: { fontSize: 16, fontWeight: "800" },
  timeChoiceHint: { fontSize: 11, fontWeight: "700" },
  timePickerBackdrop: { ...StyleSheet.absoluteFillObject, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.72)" },
  timePickerSheet: { maxHeight: "82%", borderRadius: 24, borderWidth: 1, padding: 18, gap: 12 },
  timePickerTitle: { fontSize: 21, fontWeight: "900" },
  timeOptions: { maxHeight: 360 },
  timeOptionsContent: { gap: 8, paddingBottom: 4 },
  timeOption: { minHeight: 48, borderRadius: 13, borderWidth: 1, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timeOptionValue: { fontSize: 15, fontWeight: "800" },
  timeOptionCheck: { color: "#ff82b7", fontSize: 18, fontWeight: "900" },
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
