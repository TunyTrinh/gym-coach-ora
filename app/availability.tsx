import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { GhostButton, PrimaryButton, ScreenHeader, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { haptic } from "@/lib/haptics";
import { useGym } from "@/lib/gym-store";
import { useLanguage } from "@/lib/language-provider";
import { isLocalTestMode } from "@/lib/local-test-mode";
import { trpc } from "@/lib/trpc";
import { formatDateLocalized, formatTimeLocalized } from "@/lib/i18n";
import { getBookingSlot, type AvailabilityCreateInput, type AvailabilityShift } from "@/shared/gym";

const wheelHours = Array.from({ length: 12 }, (_, index) => String(index + 1));
const wheelMinutes = ["00", "15", "30", "45"];
const wheelPeriods = ["AM", "PM"];
const rowHeight = 44;

type AvailabilityFeedback = { success: boolean; title: string; message: string };
type RoomOption = { id: string | number; name: string; maximumCapacity: number };

const previewRooms: RoomOption[] = [
  { id: "preview-studio-a", name: "Studio A", maximumCapacity: 8 },
  { id: "preview-studio-b", name: "Studio B", maximumCapacity: 12 },
  { id: "preview-gym-floor", name: "Gym floor", maximumCapacity: 16 },
];

function localDayString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function clockString(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function nextQuarterAfter(now = new Date(), leadMinutes = 30) {
  const next = addMinutes(now, leadMinutes);
  next.setSeconds(0, 0);
  next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15);
  return next;
}

function suggestedAvailabilityStart(now = new Date()) {
  const start = nextQuarterAfter(now);
  if (localDayString(start) === localDayString(addMinutes(start, 120))) return start;
  const tomorrow = addDays(now, 1);
  return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 9, 0, 0, 0);
}

function minutesOf(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

function formatAvailabilityTime(value: string, language: "en" | "vi") {
  const minutes = minutesOf(value);
  return minutes === null ? value : formatTimeLocalized(new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60), language);
}

function localizeAvailabilityError(error: string | undefined, t: (key: any) => string) {
  if (!error) return t("couldNotPublish");
  if (error.includes("overlap")) return t("availabilityConflict");
  if (error.includes("30 minutes")) return t("availabilityLeadTimeError");
  if (error.includes("future")) return t("availabilityFuture");
  if (error.includes("end time")) return t("endAfterStart");
  return error;
}

export default function AvailabilityScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { snapshot, createAvailability, setAvailabilityStatus } = useGym();
  const { language, t } = useLanguage();
  const previewMode = isLocalTestMode();
  const role = previewMode ? snapshot.member.role : user?.role;
  const isAdmin = role === "admin";
  const isCoach = role === "coach";
  const activeRoomsQuery = trpc.availability.rooms.useQuery(undefined, { enabled: !previewMode && Boolean(user) && (user?.role === "coach" || user?.role === "admin") });
  const createServerAvailability = trpc.availability.create.useMutation();
  const [selectedCoachId, setSelectedCoachId] = useState(snapshot.coaches[0]?.id ?? "");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [availabilityFeedback, setAvailabilityFeedback] = useState<AvailabilityFeedback | null>(null);
  const roomOptions = useMemo<RoomOption[]>(() => previewMode
    ? previewRooms
    : (activeRoomsQuery.data ?? []).map((room) => ({ id: room.id, name: room.name, maximumCapacity: room.maximumCapacity })), [activeRoomsQuery.data, previewMode]);

  const windows = useMemo(() => snapshot.availabilityShifts
    .filter((window) => (isAdmin ? window.coachId === selectedCoachId : window.coachId === "coach-maya"))
    .filter((window) => new Date(window.end).getTime() > Date.now())
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()), [isAdmin, selectedCoachId, snapshot.availabilityShifts]);

  const bookedCount = (windowId: string) => snapshot.bookings.filter((booking) => {
    if (!["Confirmed", "Pending"].includes(booking.status)) return false;
    return getBookingSlot(snapshot, booking)?.availabilityShiftId === windowId;
  }).length;

  const updateStatus = async (window: AvailabilityShift, status: "Available" | "Blocked") => {
    setBusy(true);
    const result = await setAvailabilityStatus(window.id, status);
    setBusy(false);
    if (result.success) haptic.success(); else haptic.error();
    setAvailabilityFeedback({
      success: result.success,
      title: result.success ? t("shiftUpdated") : t("couldNotUpdateShift"),
      message: (result.success ? result.message ?? t("availabilityUpdated") : result.error) ?? t("couldNotUpdateShift"),
    });
  };

  if (!isCoach && !isAdmin) {
    return <ScreenContainer className="px-5" edges={["top", "left", "right"]}><View style={styles.restricted}><ScreenHeader title={t("availability")} subtitle={t("coachWorkspace")} label={t("restricted")} /><SurfaceCard style={styles.restrictedCard}><Text style={[styles.restrictedTitle, { color: colors.foreground }]}>{t("coachAccessRequired")}</Text><Text style={[styles.restrictedCopy, { color: colors.muted }]}>{t("coachAccessBody")}</Text><PrimaryButton title={t("browseSessions")} onPress={() => router.replace("/(tabs)/book")} /></SurfaceCard></View></ScreenContainer>;
  }

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <FlatList
        data={windows}
        keyExtractor={(window) => window.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View style={styles.header}><ScreenHeader title={t("availability")} subtitle={t("availabilitySubtitle")} label={isAdmin ? t("admin") : t("coachLabel")} />{isAdmin ? <CoachPicker selectedId={selectedCoachId} onSelect={setSelectedCoachId} /> : null}<PrimaryButton title={t("addAvailability")} onPress={() => setShowCreate(true)} /><Text style={[styles.sectionLabel, { color: colors.muted }]}>{t("publishedWindows")}</Text></View>}
        ListEmptyComponent={<SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noAvailabilityYet")}</Text><Text style={[styles.emptyCopy, { color: colors.muted }]}>{t("addFutureTime")}</Text><PrimaryButton title={t("addAvailability")} onPress={() => setShowCreate(true)} /></SurfaceCard>}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <WindowCard window={item} bookedCount={bookedCount(item.id)} language={language} t={t} colors={colors} busy={busy} onBlock={() => updateStatus(item, "Blocked")} onOpen={() => updateStatus(item, "Available")} />}
      />
      <CreateAvailabilitySheet
        visible={showCreate}
        coachId={selectedCoachId}
        language={language}
        t={t}
        busy={busy}
        rooms={roomOptions}
        onClose={() => setShowCreate(false)}
        onValidationError={(message) => {
          haptic.error();
          setAvailabilityFeedback({ success: false, title: t("couldNotPublish"), message });
        }}
        onCreate={async (input) => {
          setBusy(true);
          const result = previewMode
            ? await createAvailability(input)
            : await createServerAvailability.mutateAsync({
              startDate: input.startDate,
              startTime: input.startTime,
              endTime: input.endTime,
              maximumCapacity: input.maximumCapacity,
              roomId: Number(input.roomId),
              location: input.location,
              note: input.note,
            }).then(() => ({ success: true, message: t("membersCanBook") })).catch((error: unknown) => ({ success: false, error: error instanceof Error ? error.message : t("couldNotPublish") }));
          setBusy(false);
          if (result.success) {
            haptic.success();
            setShowCreate(false);
          } else {
            haptic.error();
          }
          setAvailabilityFeedback({
            success: result.success,
            title: result.success ? t("availabilityPublished") : t("couldNotPublish"),
            message: result.success ? ("message" in result ? result.message ?? t("membersCanBook") : t("membersCanBook")) : localizeAvailabilityError("error" in result ? result.error : t("couldNotPublish"), t),
          });
        }}
      />
      <AvailabilityFeedbackSheet feedback={availabilityFeedback} onClose={() => setAvailabilityFeedback(null)} />
    </ScreenContainer>
  );
}

function CoachPicker({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const colors = useColors();
  const { snapshot } = useGym();
  const { t } = useLanguage();
  return <View style={styles.adminPicker}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("selectCoach")}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.coachRail}>{snapshot.coaches.map((coach) => <Pressable key={coach.id} onPress={() => onSelect(coach.id)} style={({ pressed }) => [styles.coachPill, { backgroundColor: selectedId === coach.id ? "#2b1f2a" : colors.surface, borderColor: selectedId === coach.id ? "#f04488" : colors.border }, pressed && styles.pressed]}><Text style={[styles.coachPillText, { color: selectedId === coach.id ? "#ff82b7" : colors.muted }]}>{coach.fullName}</Text></Pressable>)}</ScrollView></View>;
}

function WindowCard({ window, bookedCount, language, t, colors, busy, onBlock, onOpen }: { window: AvailabilityShift; bookedCount: number; language: "en" | "vi"; t: (key: any) => string; colors: ReturnType<typeof useColors>; busy: boolean; onBlock: () => void; onOpen: () => void }) {
  const isOpen = window.status === "Available";
  return <SurfaceCard style={styles.windowCard}><View style={styles.windowTop}><View style={styles.windowCopy}><Text style={[styles.windowDate, { color: colors.foreground }]}>{formatDateLocalized(window.start, language, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</Text><Text style={[styles.windowTime, { color: colors.foreground }]}>{formatTimeLocalized(window.start, language)}–{formatTimeLocalized(window.end, language)}</Text></View><StatusBadge label={isOpen ? t("available") : t("blocked")} tone={isOpen ? "success" : "warning"} /></View><Text style={[styles.windowMeta, { color: colors.muted }]}>{window.location}{window.note ? ` · ${window.note}` : ""}</Text><View style={[styles.capacityPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}><View><Text style={[styles.capacityValue, { color: colors.foreground }]}>{bookedCount}</Text><Text style={[styles.capacityLabel, { color: colors.muted }]}>{t("sessionsBooked")}</Text></View><View style={styles.capacityRight}><Text style={[styles.capacityValue, { color: "#ff82b7" }]}>{window.maximumCapacity}</Text><Text style={[styles.capacityLabel, { color: colors.muted }]}>{t("clientsAtATime")}</Text></View></View><Text style={[styles.windowHint, { color: colors.muted }]}>{t("continuousWindowHint")}</Text><View style={styles.cardAction}>{isOpen ? <GhostButton title={busy ? t("updating") : t("blockTime")} onPress={onBlock} /> : <PrimaryButton title={busy ? t("updating") : t("makeAvailable")} onPress={onOpen} disabled={busy} />}</View></SurfaceCard>;
}

function CreateAvailabilitySheet({ visible, coachId, language, t, busy, rooms, onClose, onValidationError, onCreate }: { visible: boolean; coachId: string; language: "en" | "vi"; t: (key: any) => string; busy: boolean; rooms: RoomOption[]; onClose: () => void; onValidationError: (message: string) => void; onCreate: (input: AvailabilityCreateInput) => Promise<void> }) {
  const colors = useColors();
  const [today] = useState(() => new Date());
  const dates = useMemo(() => Array.from({ length: 10 }, (_, index) => addDays(today, index)), [today]);
  const [date, setDate] = useState(() => localDayString(suggestedAvailabilityStart(today)));
  const [startTime, setStartTime] = useState(() => clockString(suggestedAvailabilityStart(today)));
  const [endTime, setEndTime] = useState(() => clockString(addMinutes(suggestedAvailabilityStart(today), 120)));
  const [capacity, setCapacity] = useState(3);
  const [roomId, setRoomId] = useState<string | number | null>(null);
  const [note, setNote] = useState("");
  const [activeTimeField, setActiveTimeField] = useState<"start" | "end" | null>(null);
  const [timeDraft, setTimeDraft] = useState("09:00");
  const [showMore, setShowMore] = useState(false);

  const selectedStart = useMemo(() => new Date(`${date}T${startTime}:00`), [date, startTime]);
  const selectedRoom = rooms.find((room) => String(room.id) === String(roomId));
  const isToday = date === localDayString(new Date());
  const violatesTodayLeadTime = isToday && selectedStart.getTime() < Date.now() + 30 * 60_000;

  useEffect(() => {
    if (!selectedRoom && rooms[0]) setRoomId(rooms[0].id);
    if (selectedRoom && capacity > selectedRoom.maximumCapacity) setCapacity(selectedRoom.maximumCapacity);
  }, [capacity, rooms, selectedRoom]);

  const openPicker = (field: "start" | "end") => { setTimeDraft(field === "start" ? startTime : endTime); setActiveTimeField(field); };
  const savePicker = () => { if (activeTimeField === "start") setStartTime(timeDraft); if (activeTimeField === "end") setEndTime(timeDraft); setActiveTimeField(null); };
  const publish = () => {
    const start = minutesOf(startTime); const end = minutesOf(endTime);
    if (start === null || end === null) { onValidationError(t("chooseValidTime")); return; }
    if (violatesTodayLeadTime) { onValidationError(t("availabilityLeadTimeError")); return; }
    if (end <= start) { onValidationError(t("endAfterStart")); return; }
    if (!selectedRoom) { onValidationError(t("selectRoom")); return; }
    void onCreate({ coachId, startDate: date, startTime, endTime, maximumCapacity: capacity, roomId: selectedRoom.id, location: selectedRoom.name, note: note.trim() || undefined });
  }; 
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><ScrollView style={[styles.sheet, { backgroundColor: "#151518", borderColor: colors.border }]} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}><View style={styles.sheetHandle} /><Text style={styles.sheetEyebrow}>{t("publishFreeTime")}</Text><Text style={[styles.sheetTitle, { color: colors.foreground }]}>{t("addAvailability")}</Text><Text style={[styles.sheetCopy, { color: colors.muted }]}>{t("continuousWindowHint")}</Text><Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("availabilityDate")}</Text><FlatList horizontal data={dates} keyExtractor={(item) => item.toISOString()} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRail} renderItem={({ item }) => <Pressable onPress={() => setDate(localDayString(item))} style={({ pressed }) => [styles.datePill, { borderColor: date === localDayString(item) ? "#f04488" : colors.border, backgroundColor: date === localDayString(item) ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><Text style={[styles.datePillText, { color: date === localDayString(item) ? "#ff82b7" : colors.muted }]}>{formatDateLocalized(item, language, { weekday: "short", day: "numeric" })}</Text></Pressable>} /><Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("selectRoom")}</Text>{rooms.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={roomPickerStyles.rail}>{rooms.map((room) => <Pressable key={String(room.id)} onPress={() => setRoomId(room.id)} style={({ pressed }) => [roomPickerStyles.pill, { borderColor: String(room.id) === String(roomId) ? "#f04488" : colors.border, backgroundColor: String(room.id) === String(roomId) ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><Text style={[roomPickerStyles.name, { color: String(room.id) === String(roomId) ? "#ff82b7" : colors.foreground }]}>{room.name}</Text><Text style={[roomPickerStyles.capacity, { color: colors.muted }]}>{room.maximumCapacity}</Text></Pressable>)}</ScrollView> : <Text style={[styles.fieldHint, { color: colors.error }]}>{t("noRooms")}</Text>}<TimeChoice label={t("starts")} value={formatAvailabilityTime(startTime, language)} onPress={() => openPicker("start")} />{violatesTodayLeadTime ? <Text style={styles.leadTimeWarning}>{t("availabilityLeadTime")}</Text> : null}<TimeChoice label={t("ends")} value={formatAvailabilityTime(endTime, language)} onPress={() => openPicker("end")} /><Text style={[styles.fieldLabel, { color: colors.muted }]}>{t("maxConcurrentClients")}</Text><Text style={[styles.fieldHint, { color: colors.muted }]}>{t("maxConcurrentHint")}</Text><CapacityStepper value={capacity} maximum={selectedRoom?.maximumCapacity ?? 1} onChange={setCapacity} /><Pressable onPress={() => setShowMore((value) => !value)} style={({ pressed }) => [styles.moreRow, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><View><Text style={[styles.moreTitle, { color: colors.foreground }]}>{t("moreOptions")}</Text><Text style={[styles.moreCopy, { color: colors.muted }]}>{t("noteOptional")}</Text></View><Text style={styles.moreToggle}>{showMore ? t("hide") : t("show")}</Text></Pressable>{showMore ? <Field label={t("noteOptional")} value={note} onChangeText={setNote} /> : null}<View style={styles.sheetActions}><GhostButton title={t("cancel")} onPress={onClose} /><View style={styles.createAction}><PrimaryButton title={busy ? t("publishing") : t("publish")} disabled={busy || !selectedRoom} onPress={publish} /></View></View></ScrollView>{activeTimeField ? <View style={styles.timePickerBackdrop}><View style={[styles.timePickerSheet, { backgroundColor: "#151518", borderColor: colors.border }]}><View style={styles.timePickerHeader}><Pressable onPress={() => setActiveTimeField(null)} style={styles.timePickerAction}><Text style={styles.timePickerActionText}>{t("cancel")}</Text></Pressable><Text style={[styles.timePickerTitle, { color: colors.foreground }]}>{activeTimeField === "start" ? t("starts") : t("ends")}</Text><Pressable onPress={savePicker} style={styles.timePickerAction}><Text style={styles.timePickerActionText}>{t("save")}</Text></Pressable></View><TimeWheelPicker value={timeDraft} onChange={setTimeDraft} colors={colors} /></View></View> : null}</View></Modal>;
}

function AvailabilityFeedbackSheet({ feedback, onClose }: { feedback: AvailabilityFeedback | null; onClose: () => void }) {
  const colors = useColors();
  const { t } = useLanguage();
  return <Modal transparent visible={feedback !== null} animationType="fade" statusBarTranslucent onRequestClose={onClose}><View style={styles.feedbackBackdrop}><Pressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={onClose} style={styles.feedbackDismiss} />{feedback ? <View style={[styles.feedbackCard, { borderColor: colors.border }]}><View style={[styles.feedbackIcon, { backgroundColor: feedback.success ? `${colors.success}24` : `${colors.error}24` }]}><Text style={[styles.feedbackIconText, { color: feedback.success ? colors.success : colors.error }]}>{feedback.success ? "✓" : "!"}</Text></View><Text style={[styles.feedbackTitle, { color: colors.foreground }]}>{feedback.title}</Text><Text style={[styles.feedbackMessage, { color: colors.muted }]}>{feedback.message}</Text><Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.feedbackButton, { backgroundColor: feedback.success ? "#e8f7ef" : "#ffe9e7" }, pressed && styles.feedbackButtonPressed]}><Text style={[styles.feedbackButtonText, { color: feedback.success ? "#123d29" : "#6f1814" }]}>{t("close")}</Text></Pressable></View> : null}</View></Modal>;
}

function TimeChoice({ label, value, onPress }: { label: string; value: string; onPress: () => void }) { const colors = useColors(); return <View style={styles.timeField}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><Pressable onPress={onPress} style={({ pressed }) => [styles.timeChoice, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.timeChoiceValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.timeChoiceHint, { color: colors.muted }]}>›</Text></Pressable></View>; }
function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) { const colors = useColors(); return <View style={styles.field}><Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} style={[styles.fullInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} placeholderTextColor={colors.muted} /></View>; }
function CapacityStepper({ value, maximum, onChange }: { value: number; maximum: number; onChange: (value: number) => void }) { const colors = useColors(); return <View style={[styles.stepper, { borderColor: colors.border, backgroundColor: colors.surface }]}><Pressable onPress={() => onChange(Math.max(1, value - 1))} style={styles.stepButton}><Text style={[styles.stepText, { color: colors.foreground }]}>−</Text></Pressable><Text style={[styles.stepValue, { color: colors.foreground }]}>{value}</Text><Pressable onPress={() => onChange(Math.min(Math.max(1, maximum), value + 1))} style={styles.stepButton}><Text style={[styles.stepText, { color: colors.foreground }]}>+</Text></Pressable></View>; }

function timeParts(value: string) { const minutes = minutesOf(value) ?? 540; const hour = Math.floor(minutes / 60); return { hour: String(hour % 12 || 12), minute: String(minutes % 60).padStart(2, "0"), period: hour >= 12 ? "PM" : "AM" }; }
function fromParts(hour: string, minute: string, period: string) { const hour24 = (Number(hour) % 12) + (period === "PM" ? 12 : 0); return `${String(hour24).padStart(2, "0")}:${minute}`; }
function WheelColumn({ options, selectedIndex, onChange, colors }: { options: string[]; selectedIndex: number; onChange: (index: number) => void; colors: ReturnType<typeof useColors> }) {
  const ref = useRef<FlatList<string>>(null);
  const isDragging = useRef(false);
  const lastOffset = useRef(0);
  const webSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isDragging.current) return;
    const frame = requestAnimationFrame(() => ref.current?.scrollToOffset({ offset: Math.max(0, selectedIndex) * rowHeight, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [selectedIndex]);
  useEffect(() => () => { if (webSettleTimer.current) clearTimeout(webSettleTimer.current); }, []);
  const settleAtOffset = (offset: number) => {
    const index = Math.max(0, Math.min(options.length - 1, Math.round(offset / rowHeight)));
    isDragging.current = false;
    ref.current?.scrollToOffset({ offset: index * rowHeight, animated: true });
    onChange(index);
  };
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS !== "web") return;
    isDragging.current = true;
    lastOffset.current = event.nativeEvent.contentOffset.y;
    if (webSettleTimer.current) clearTimeout(webSettleTimer.current);
    webSettleTimer.current = setTimeout(() => settleAtOffset(lastOffset.current), 90);
  };
  return <FlatList ref={ref} data={options} keyExtractor={(item) => item} style={styles.wheelColumn} contentContainerStyle={styles.wheelList} showsVerticalScrollIndicator={false} snapToInterval={rowHeight} snapToAlignment="center" disableIntervalMomentum decelerationRate="fast" onScrollBeginDrag={() => { isDragging.current = true; }} onScroll={handleScroll} scrollEventThrottle={16} onMomentumScrollEnd={Platform.OS === "web" ? undefined : (event) => settleAtOffset(event.nativeEvent.contentOffset.y)} onScrollEndDrag={Platform.OS === "web" ? () => { if (webSettleTimer.current) clearTimeout(webSettleTimer.current); webSettleTimer.current = setTimeout(() => settleAtOffset(lastOffset.current), 40); } : undefined} getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })} renderItem={({ item, index }) => <View style={styles.wheelRow}><Text style={[styles.wheelValue, { color: index === selectedIndex ? "#ff82b7" : colors.muted, opacity: index === selectedIndex ? 1 : 0.42 }, index === selectedIndex ? styles.wheelValueSelected : null]}>{item}</Text></View>} />;
}
function TimeWheelPicker({ value, onChange, colors }: { value: string; onChange: (value: string) => void; colors: ReturnType<typeof useColors> }) { const parts = timeParts(value); const update = (field: "hour" | "minute" | "period", next: string) => { const all = { ...parts, [field]: next }; onChange(fromParts(all.hour, all.minute, all.period)); }; return <View style={styles.wheelPicker}><View pointerEvents="none" style={[styles.wheelFrame, { borderColor: colors.border }]} /><View style={styles.wheelColumns}><WheelColumn options={wheelHours} selectedIndex={wheelHours.indexOf(parts.hour)} onChange={(index) => update("hour", wheelHours[index])} colors={colors} /><Text style={[styles.wheelSeparator, { color: colors.muted }]}>:</Text><WheelColumn options={wheelMinutes} selectedIndex={wheelMinutes.indexOf(parts.minute)} onChange={(index) => update("minute", wheelMinutes[index])} colors={colors} /><WheelColumn options={wheelPeriods} selectedIndex={wheelPeriods.indexOf(parts.period)} onChange={(index) => update("period", wheelPeriods[index])} colors={colors} /></View></View>; }

const styles = StyleSheet.create({
  feedbackBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, backgroundColor: "rgba(4, 5, 7, 0.72)" }, feedbackDismiss: { ...StyleSheet.absoluteFillObject }, feedbackCard: { width: "100%", maxWidth: 340, borderRadius: 26, borderWidth: 1, paddingHorizontal: 22, paddingTop: 25, paddingBottom: 18, alignItems: "center", backgroundColor: "#1d1d21", shadowColor: "#000000", shadowOpacity: 0.42, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 12 }, feedbackIcon: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginBottom: 17 }, feedbackIconText: { fontSize: 29, lineHeight: 33, fontWeight: "800" }, feedbackTitle: { fontSize: 20, lineHeight: 25, fontWeight: "800", textAlign: "center", letterSpacing: -0.3 }, feedbackMessage: { marginTop: 8, fontSize: 14, lineHeight: 20, textAlign: "center" }, feedbackButton: { alignSelf: "stretch", minHeight: 46, borderRadius: 14, marginTop: 23, alignItems: "center", justifyContent: "center" }, feedbackButtonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] }, feedbackButtonText: { fontSize: 15, fontWeight: "800" },
  content: { paddingTop: 10, paddingBottom: 40 }, header: { gap: 15, paddingBottom: 16 }, adminPicker: { gap: 8 }, coachRail: { gap: 8 }, coachPill: { borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 }, coachPillText: { fontSize: 12, fontWeight: "800" }, sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4 }, separator: { height: 10 }, windowCard: { gap: 11, padding: 16 }, windowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }, windowCopy: { flex: 1 }, windowDate: { fontSize: 16, fontWeight: "900" }, windowTime: { fontSize: 14, fontWeight: "800", marginTop: 4 }, windowMeta: { fontSize: 12, lineHeight: 18 }, capacityPanel: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", justifyContent: "space-between" }, capacityRight: { alignItems: "flex-end" }, capacityValue: { fontSize: 20, fontWeight: "900" }, capacityLabel: { fontSize: 11, marginTop: 2 }, windowHint: { fontSize: 11, lineHeight: 16 }, cardAction: { alignSelf: "flex-start" }, emptyCard: { gap: 10, padding: 20 }, emptyTitle: { fontSize: 18, fontWeight: "900" }, emptyCopy: { fontSize: 13, lineHeight: 19 }, restricted: { paddingTop: 10, gap: 18 }, restrictedCard: { gap: 12, padding: 19 }, restrictedTitle: { fontSize: 20, fontWeight: "900" }, restrictedCopy: { fontSize: 13, lineHeight: 20 }, modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.68)" }, sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, maxHeight: "94%" }, sheetContent: { padding: 20, gap: 12 }, sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#555560", alignSelf: "center", marginBottom: 2 }, sheetEyebrow: { color: "#ff82b7", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 }, sheetTitle: { fontSize: 25, fontWeight: "900", letterSpacing: -0.5 }, sheetCopy: { fontSize: 12, lineHeight: 18 }, fieldLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 2 }, fieldHint: { fontSize: 11, lineHeight: 16, marginTop: -7 }, leadTimeWarning: { color: "#ff6b61", fontSize: 11, fontWeight: "700", lineHeight: 16, marginTop: -3 }, dateRail: { gap: 8, paddingRight: 14 }, datePill: { borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 }, datePillText: { fontSize: 12, fontWeight: "800" }, timeField: { gap: 7 }, timeChoice: { height: 54, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, timeChoiceValue: { fontSize: 16, fontWeight: "800" }, timeChoiceHint: { fontSize: 24, fontWeight: "700" }, stepper: { borderWidth: 1, borderRadius: 14, height: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, stepButton: { width: 58, height: "100%", justifyContent: "center", alignItems: "center" }, stepText: { fontSize: 25, fontWeight: "500" }, stepValue: { fontSize: 20, fontWeight: "900" }, field: { gap: 7 }, fullInput: { height: 46, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, fontSize: 15, fontWeight: "700" }, moreRow: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }, moreTitle: { fontSize: 14, fontWeight: "900" }, moreCopy: { fontSize: 11, marginTop: 3 }, moreToggle: { color: "#ff82b7", fontSize: 11, fontWeight: "900" }, sheetActions: { flexDirection: "row", gap: 10, alignItems: "center", paddingTop: 4 }, createAction: { flex: 1 }, timePickerBackdrop: { ...StyleSheet.absoluteFillObject, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.72)" }, timePickerSheet: { borderRadius: 24, borderWidth: 1, padding: 18, gap: 13 }, timePickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, timePickerAction: { minWidth: 60, paddingVertical: 8 }, timePickerActionText: { color: "#ff82b7", fontSize: 13, fontWeight: "900" }, timePickerTitle: { fontSize: 14, fontWeight: "900" }, wheelPicker: { height: rowHeight * 5, justifyContent: "center" }, wheelFrame: { position: "absolute", left: 0, right: 0, top: rowHeight * 2, height: rowHeight, borderTopWidth: 1, borderBottomWidth: 1, backgroundColor: "rgba(255,255,255,0.07)" }, wheelColumns: { flexDirection: "row", flex: 1, alignItems: "center", justifyContent: "center", gap: 7 }, wheelColumn: { width: 72, height: rowHeight * 5 }, wheelList: { paddingVertical: rowHeight * 2 }, wheelRow: { height: rowHeight, alignItems: "center", justifyContent: "center" }, wheelValue: { fontSize: 19, fontWeight: "800" }, wheelValueSelected: { fontSize: 22, fontWeight: "900", transform: [{ scale: 1.04 }] }, wheelSeparator: { fontSize: 18, fontWeight: "900" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});

const roomPickerStyles = StyleSheet.create({
  rail: { gap: 8, paddingRight: 14 },
  pill: { minWidth: 112, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  name: { fontSize: 12, fontWeight: "800" },
  capacity: { fontSize: 10, fontWeight: "700", marginTop: 3 },
});
