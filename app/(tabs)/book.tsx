import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import AvailabilityScreen from "@/app/availability";
import { Avatar, GhostButton, PrimaryButton, ScreenHeader, SpectrumCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { intervalsOverlap } from "@/lib/availability-shifts";
import { useGym } from "@/lib/gym-store";
import { haptic } from "@/lib/haptics";
import { formatDateLocalized, formatTimeLocalized } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-provider";
import { createLocalDateRail, formatLocalClock, isSameLocalDay } from "@/lib/scheduler";
import { getBookingSlot, getCoach, type AvailabilityShift, type GymSnapshot } from "@/shared/gym";

const quickDurations = [30, 45, 60] as const;
const customDurations = Array.from({ length: 13 }, (_, index) => 60 + index * 15);
const wheelRowHeight = 44;

type TimeOption = { start: Date; end: Date; remaining: number };
type Translation = ReturnType<typeof useLanguage>["t"];

function buildStartTimes(window: AvailabilityShift, duration: number, now: Date, snapshot: GymSnapshot): TimeOption[] {
  const start = new Date(window.start);
  const end = new Date(window.end);
  const first = new Date(start);
  first.setMinutes(Math.ceil(first.getMinutes() / 15) * 15, 0, 0);
  const options: TimeOption[] = [];

  for (let cursor = new Date(first); cursor.getTime() + duration * 60_000 <= end.getTime(); cursor = new Date(cursor.getTime() + 15 * 60_000)) {
    const optionEnd = new Date(cursor.getTime() + duration * 60_000);
    if (cursor.getTime() <= now.getTime()) continue;
    const overlapCount = snapshot.bookings.filter((booking) => {
      if (!['Confirmed', 'Pending'].includes(booking.status)) return false;
      const slot = getBookingSlot(snapshot, booking);
      return slot?.availabilityShiftId === window.id && intervalsOverlap(cursor.toISOString(), optionEnd.toISOString(), slot.start, slot.end);
    }).length;
    const remaining = Math.max(0, window.maximumCapacity - overlapCount);
    if (remaining > 0) options.push({ start: cursor, end: optionEnd, remaining });
  }
  return options;
}

function clockValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function BookScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { snapshot, bookAvailability } = useGym();
  const { language, t } = useLanguage();
  const role = user?.role ?? snapshot.member.role;
  const [now, setNow] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [customDurationSelected, setCustomDurationSelected] = useState(false);
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [durationDraft, setDurationDraft] = useState(60);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timeDraft, setTimeDraft] = useState("09:00");
  const [timeError, setTimeError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const days = createLocalDateRail(now, 7);
  const selectedDate = days[selectedDay] ?? days[0];
  const windows = useMemo(
    () => snapshot.availabilityShifts
      .filter((window) => window.status === "Available" && isSameLocalDay(new Date(window.start), selectedDate) && new Date(window.end) > now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [now, selectedDate, snapshot.availabilityShifts],
  );
  const selectedWindow = windows.find((window) => window.id === selectedWindowId) ?? null;
  const timeOptions = useMemo(
    () => selectedWindow ? buildStartTimes(selectedWindow, duration, now, snapshot) : [],
    [duration, now, selectedWindow, snapshot],
  );
  const selectedOption = timeOptions.find((option) => option.start.getTime() === selectedStart?.getTime()) ?? null;

  useEffect(() => {
    setSelectedWindowId(null);
    setSelectedStart(null);
  }, [selectedDay]);

  useEffect(() => {
    if (!selectedOption) setSelectedStart(null);
  }, [duration, selectedOption]);

  const selectQuickDuration = (value: number) => {
    setDuration(value);
    setCustomDurationSelected(false);
    setSelectedStart(null);
  };

  const openCustomDuration = () => {
    setDurationDraft(customDurationSelected ? duration : 60);
    setShowDurationPicker(true);
  };

  const saveCustomDuration = () => {
    setDuration(durationDraft);
    setCustomDurationSelected(true);
    setSelectedStart(null);
    setShowDurationPicker(false);
  };

  const openTimePicker = () => {
    const initial = selectedStart ?? timeOptions[0]?.start;
    if (!initial) return;
    setTimeDraft(clockValue(initial));
    setTimeError(false);
    setShowTimePicker(true);
  };

  const saveStartTime = () => {
    const option = timeOptions.find((item) => clockValue(item.start) === timeDraft);
    if (!option) {
      haptic.error();
      setTimeError(true);
      return;
    }
    setSelectedStart(option.start);
    setShowTimePicker(false);
    haptic.light();
  };

  const handleBook = async () => {
    if (!selectedWindow || !selectedOption) return;
    setBusy(true);
    const result = await bookAvailability(selectedWindow.id, selectedOption.start.toISOString(), duration);
    setBusy(false);
    if (result.success) {
      haptic.success();
      setShowReview(false);
      setSelectedStart(null);
      Alert.alert(t("youreBooked"), result.message);
    } else {
      haptic.error();
      Alert.alert(t("couldntBook"), result.error);
    }
  };

  if (role !== "client") return <AvailabilityScreen />;

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerContent}>
          <ScreenHeader title={t("bookSessionTitle")} subtitle={t("bookSessionSubtitle")} label={t("book").toUpperCase()} />
          <SpectrumCard style={styles.clockCard} intensity="muted">
            <Text style={styles.clockEyebrow}>{t("yourLocalTime")}</Text>
            <View style={styles.clockRow}>
              <View>
                <Text style={styles.clockTitle}>{isSameLocalDay(selectedDate, now) ? t("today") : formatDateLocalized(selectedDate.toISOString(), language)}</Text>
                <Text style={styles.clockMeta}>{formatLocalClock(now)} · {t("pastTimesHidden").toLowerCase()}</Text>
              </View>
              <StatusBadge label={t("live")} tone="success" />
            </View>
          </SpectrumCard>

          <Text style={[styles.stepLabel, { color: colors.muted }]}>1. {t("chooseDay")}</Text>
          <FlatList
            horizontal
            data={days}
            keyExtractor={(day) => day.toISOString()}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateStrip}
            renderItem={({ item: day, index }) => {
              const active = selectedDay === index;
              const hasAvailability = snapshot.availabilityShifts.some((window) => window.status === "Available" && isSameLocalDay(new Date(window.start), day) && new Date(window.end) > now);
              return <Pressable onPress={() => setSelectedDay(index)} style={({ pressed }) => [styles.dateCard, { backgroundColor: active ? "#2b1f2a" : colors.surface, borderColor: active ? "#f04488" : colors.border }, pressed && styles.pressed]}>
                <Text style={[styles.dateWeekday, { color: active ? "#ff82b7" : colors.muted }]}>{isSameLocalDay(day, now) ? t("today").toUpperCase() : new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", { weekday: "short" }).format(day).toUpperCase()}</Text>
                <Text style={[styles.dateNumber, { color: colors.foreground }]}>{day.getDate()}</Text>
                {hasAvailability ? <View style={styles.dateDot} /> : null}
              </Pressable>;
            }}
          />
          <Text style={[styles.stepLabel, { color: colors.muted }]}>2. {t("chooseAvailability")}</Text>
        </View>

        {windows.length ? <View style={styles.windowList}>{windows.map((window) => <AvailabilityCard key={window.id} window={window} selected={selectedWindowId === window.id} snapshot={snapshot} language={language} t={t} colors={colors} onPress={() => { setSelectedWindowId(window.id); setSelectedStart(null); }} />)}</View> : <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noAvailabilityYet")}</Text><Text style={[styles.emptyCopy, { color: colors.muted }]}>{t("noSlotsAvailable")}</Text></SurfaceCard>}

        {selectedWindow ? <View style={styles.bookingPanel}>
          <Text style={[styles.stepLabel, { color: colors.muted }]}>3. {t("sessionDuration")}</Text>
          <View style={styles.durationRail}>
            {quickDurations.map((item) => <Pressable key={item} onPress={() => selectQuickDuration(item)} style={({ pressed }) => [styles.durationChip, { borderColor: !customDurationSelected && duration === item ? "#f04488" : colors.border, backgroundColor: !customDurationSelected && duration === item ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><Text style={[styles.durationText, { color: !customDurationSelected && duration === item ? "#ff82b7" : colors.foreground }]}>{item} {t("minutes")}</Text></Pressable>)}
            <Pressable onPress={openCustomDuration} style={({ pressed }) => [styles.durationChip, { borderColor: customDurationSelected ? "#f04488" : colors.border, backgroundColor: customDurationSelected ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><Text style={[styles.durationText, { color: customDurationSelected ? "#ff82b7" : colors.foreground }]}>{customDurationSelected ? `${t("otherDuration")} · ${duration}m` : t("otherDuration")}</Text></Pressable>
          </View>

          <View style={styles.timeHeading}>
            <Text style={[styles.stepLabel, { color: colors.muted }]}>4. {t("chooseStartTime")}</Text>
            <Text style={[styles.timeCount, { color: colors.muted }]}>{timeOptions.length} {t("availableCount")}</Text>
          </View>
          {timeOptions.length ? <Pressable onPress={openTimePicker} style={({ pressed }) => [styles.timeChoice, { backgroundColor: colors.surface, borderColor: selectedOption ? "#f04488" : colors.border }, pressed && styles.pressed]}>
            <View>
              <Text style={[styles.timeChoiceValue, { color: selectedOption ? "#ff82b7" : colors.foreground }]}>{selectedOption ? formatTimeLocalized(selectedOption.start, language) : t("chooseStartTime")}</Text>
              <Text style={[styles.timeChoiceHint, { color: colors.muted }]}>{selectedOption ? `${selectedOption.remaining} ${t("capacityAvailable")}` : t("choose")}</Text>
            </View>
            <Text style={[styles.timeChoiceChevron, { color: selectedOption ? "#ff82b7" : colors.muted }]}>›</Text>
          </Pressable> : <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyCopy, { color: colors.muted }]}>{t("noTimesForDuration")}</Text></SurfaceCard>}

          {selectedOption ? <SurfaceCard style={styles.reviewCard}>
            <View style={styles.reviewCopy}>
              <Text style={[styles.reviewLabel, { color: colors.muted }]}>{t("calculatedEndTime")}</Text>
              <Text style={[styles.reviewTime, { color: colors.foreground }]}>{formatTimeLocalized(selectedOption.start, language)}–{formatTimeLocalized(selectedOption.end, language)}</Text>
              <Text style={[styles.reviewMeta, { color: colors.muted }]}>{duration} {t("minutes")} · {selectedOption.remaining} {t("remainingCapacity")}</Text>
            </View>
            <View style={styles.confirmWrap}><PrimaryButton title={t("confirmBookingTitle")} onPress={() => setShowReview(true)} /></View>
          </SurfaceCard> : null}
        </View> : null}
      </ScrollView>

      <BookingReview visible={showReview} window={selectedWindow} option={selectedOption} duration={duration} colors={colors} language={language} t={t} busy={busy} onClose={() => setShowReview(false)} onBook={handleBook} />
      <DurationPicker visible={showDurationPicker} value={durationDraft} colors={colors} t={t} onChange={setDurationDraft} onClose={() => setShowDurationPicker(false)} onSave={saveCustomDuration} />
      <StartTimePicker visible={showTimePicker} value={timeDraft} options={timeOptions} colors={colors} language={language} t={t} error={timeError} onChange={setTimeDraft} onClose={() => setShowTimePicker(false)} onSave={saveStartTime} />
    </ScreenContainer>
  );
}

function AvailabilityCard({ window, selected, snapshot, language, t, colors, onPress }: { window: AvailabilityShift; selected: boolean; snapshot: GymSnapshot; language: "en" | "vi"; t: Translation; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  const coach = getCoach(snapshot, window.coachId);
  return <SurfaceCard style={[styles.windowCard, { borderColor: selected ? "#f04488" : colors.border }]} onPress={onPress}>
    <View style={styles.windowTop}>
      {coach ? <View style={styles.coachRow}><Avatar initials={coach.initials} accent={coach.accent} size={38} /><View><Text style={[styles.coachName, { color: colors.foreground }]}>{coach.fullName}</Text><Text style={[styles.coachMeta, { color: colors.muted }]}>{window.location}</Text></View></View> : null}
      <StatusBadge label={`${window.maximumCapacity} ${t("clients")}`} tone="success" />
    </View>
    <Text style={[styles.windowTime, { color: colors.foreground }]}>{formatTimeLocalized(window.start, language)}–{formatTimeLocalized(window.end, language)}</Text>
    <Text style={[styles.windowHint, { color: colors.muted }]}>{t("continuousWindowHint")}</Text>
  </SurfaceCard>;
}

function BookingReview({ visible, window, option, duration, colors, language, t, busy, onClose, onBook }: { visible: boolean; window: AvailabilityShift | null; option: TimeOption | null; duration: number; colors: ReturnType<typeof useColors>; language: "en" | "vi"; t: Translation; busy: boolean; onClose: () => void; onBook: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={[styles.sheet, { backgroundColor: "#151518", borderColor: colors.border }]}><View style={styles.sheetHandle} /><Text style={styles.sheetEyebrow}>{t("finalStep")}</Text><Text style={[styles.sheetTitle, { color: colors.foreground }]}>{t("confirmSessionTime")}</Text>{window && option ? <><Text style={[styles.sheetDate, { color: colors.foreground }]}>{formatDateLocalized(option.start.toISOString(), language)}</Text><Text style={[styles.sheetTime, { color: colors.foreground }]}>{formatTimeLocalized(option.start, language)}–{formatTimeLocalized(option.end, language)}</Text><Text style={[styles.sheetMeta, { color: colors.muted }]}>{duration} {t("minutes")} · {window.location} · {option.remaining} {t("remainingCapacity")}</Text></> : null}<Text style={[styles.policyText, { color: colors.muted }]}>{t("sessionMustFit")}</Text><View style={styles.sheetActions}><GhostButton title={t("back")} onPress={onClose} /><View style={styles.confirmWrap}><PrimaryButton title={busy ? t("publishing") : t("confirmBookingTitle")} onPress={onBook} disabled={busy} /></View></View></View></View></Modal>;
}

function DurationPicker({ visible, value, colors, t, onChange, onClose, onSave }: { visible: boolean; value: number; colors: ReturnType<typeof useColors>; t: Translation; onChange: (value: number) => void; onClose: () => void; onSave: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.pickerBackdrop}><View style={[styles.pickerSheet, { backgroundColor: "#151518", borderColor: colors.border }]}><PickerHeader title={t("chooseCustomDuration")} t={t} onClose={onClose} onSave={onSave} /><Text style={[styles.pickerHint, { color: colors.muted }]}>{t("customDurationHint")}</Text><DurationWheel value={value} onChange={onChange} colors={colors} t={t} /></View></View></Modal>;
}

function StartTimePicker({ visible, value, options, colors, language, t, error, onChange, onClose, onSave }: { visible: boolean; value: string; options: TimeOption[]; colors: ReturnType<typeof useColors>; language: "en" | "vi"; t: Translation; error: boolean; onChange: (value: string) => void; onClose: () => void; onSave: () => void }) {
  const selectedIndex = Math.max(0, options.findIndex((option) => clockValue(option.start) === value));
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.pickerBackdrop}><View style={[styles.pickerSheet, { backgroundColor: "#151518", borderColor: colors.border }]}><PickerHeader title={t("chooseStartTime")} t={t} onClose={onClose} onSave={onSave} />{options.length ? <View style={styles.durationWheel}><View pointerEvents="none" style={[styles.wheelFrame, { borderColor: colors.border }]} /><WheelColumn options={options} selectedIndex={selectedIndex} onChange={(index) => onChange(clockValue(options[index].start))} colors={colors} renderLabel={(option) => formatTimeLocalized(option.start, language)} /></View> : null}{error ? <Text style={styles.timeWarning}>{t("noTimesForDuration")}</Text> : null}</View></View></Modal>;
}

function PickerHeader({ title, t, onClose, onSave }: { title: string; t: Translation; onClose: () => void; onSave: () => void }) {
  return <View style={styles.pickerHeader}><Pressable onPress={onClose} style={styles.pickerAction}><Text style={styles.pickerActionText}>{t("cancel")}</Text></Pressable><Text style={styles.pickerTitle}>{title}</Text><Pressable onPress={onSave} style={[styles.pickerAction, styles.pickerSave]}><Text style={styles.pickerActionText}>{t("save")}</Text></Pressable></View>;
}

function WheelColumn<T>({ options, selectedIndex, onChange, colors, renderLabel }: { options: readonly T[]; selectedIndex: number; onChange: (index: number) => void; colors: ReturnType<typeof useColors>; renderLabel?: (value: T) => string }) {
  const ref = useRef<FlatList<T>>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.scrollToOffset({ offset: Math.max(0, selectedIndex) * wheelRowHeight, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [selectedIndex]);
  const finish = (event: NativeSyntheticEvent<NativeScrollEvent>) => onChange(Math.max(0, Math.min(options.length - 1, Math.round(event.nativeEvent.contentOffset.y / wheelRowHeight))));
  return <FlatList ref={ref} data={[...options]} keyExtractor={(_, index) => String(index)} style={styles.wheelColumn} contentContainerStyle={styles.wheelList} showsVerticalScrollIndicator={false} snapToInterval={wheelRowHeight} decelerationRate="fast" onMomentumScrollEnd={finish} onScrollEndDrag={finish} getItemLayout={(_, index) => ({ length: wheelRowHeight, offset: wheelRowHeight * index, index })} renderItem={({ item, index }) => <View style={styles.wheelRow}><Text style={[styles.wheelValue, { color: index === selectedIndex ? "#ff82b7" : colors.muted, opacity: index === selectedIndex ? 1 : 0.42 }]}>{renderLabel ? renderLabel(item) : String(item)}</Text></View>} />;
}

function DurationWheel({ value, onChange, colors, t }: { value: number; onChange: (value: number) => void; colors: ReturnType<typeof useColors>; t: Translation }) {
  return <View style={styles.durationWheel}><View pointerEvents="none" style={[styles.wheelFrame, { borderColor: colors.border }]} /><WheelColumn options={customDurations} selectedIndex={customDurations.indexOf(value)} onChange={(index) => onChange(customDurations[index])} colors={colors} renderLabel={(item) => `${item} ${t("minutes")}`} /></View>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 14 },
  headerContent: { gap: 15 },
  clockCard: { minHeight: 108 },
  clockEyebrow: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  clockRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 5 },
  clockTitle: { color: "#ffffff", fontSize: 24, fontWeight: "800" },
  clockMeta: { color: "rgba(255,255,255,0.78)", fontSize: 12, marginTop: 4 },
  stepLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.25 },
  dateStrip: { gap: 8, paddingRight: 14 },
  dateCard: { width: 65, minHeight: 74, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 5 },
  dateWeekday: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  dateNumber: { fontSize: 22, fontWeight: "900" },
  dateDot: { position: "absolute", bottom: 8, width: 5, height: 5, borderRadius: 3, backgroundColor: "#32d77b" },
  windowList: { gap: 10 },
  windowCard: { gap: 11, padding: 16, borderWidth: 1 },
  windowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  coachRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  coachName: { fontSize: 14, fontWeight: "900" },
  coachMeta: { fontSize: 11, marginTop: 3 },
  windowTime: { fontSize: 20, fontWeight: "900" },
  windowHint: { fontSize: 11, lineHeight: 16 },
  bookingPanel: { gap: 12, paddingTop: 4 },
  durationRail: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  durationChip: { borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  durationText: { fontSize: 12, fontWeight: "900" },
  timeHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  timeCount: { fontSize: 12, fontWeight: "700" },
  timeChoice: { minHeight: 66, borderRadius: 15, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timeChoiceValue: { fontSize: 17, fontWeight: "900" },
  timeChoiceHint: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  timeChoiceChevron: { fontSize: 27, fontWeight: "500" },
  emptyCard: { gap: 8, padding: 17 },
  emptyTitle: { fontSize: 17, fontWeight: "900" },
  emptyCopy: { fontSize: 13, lineHeight: 19 },
  reviewCard: { padding: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  reviewCopy: { flex: 1 },
  reviewLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  reviewTime: { fontSize: 18, fontWeight: "900", marginTop: 4 },
  reviewMeta: { fontSize: 11, marginTop: 3 },
  confirmWrap: { flex: 1 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.68)" },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, padding: 20, gap: 13 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#555560", alignSelf: "center", marginBottom: 2 },
  sheetEyebrow: { color: "#ff82b7", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  sheetTitle: { fontSize: 25, fontWeight: "900", letterSpacing: -0.5 },
  sheetDate: { fontSize: 15, fontWeight: "800", marginTop: 4 },
  sheetTime: { fontSize: 24, fontWeight: "900" },
  sheetMeta: { fontSize: 12, lineHeight: 18 },
  policyText: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  sheetActions: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 3 },
  pickerBackdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.72)" },
  pickerSheet: { borderRadius: 24, borderWidth: 1, padding: 18, gap: 13 },
  pickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pickerAction: { minWidth: 60, paddingVertical: 8 },
  pickerSave: { alignItems: "flex-end" },
  pickerActionText: { color: "#ff82b7", fontSize: 13, fontWeight: "900" },
  pickerTitle: { color: "#f7f7f8", fontSize: 14, fontWeight: "900", flex: 1, textAlign: "center" },
  pickerHint: { fontSize: 11, lineHeight: 16, marginTop: -3 },
  timeWarning: { color: "#ff6b61", fontSize: 11, fontWeight: "700", lineHeight: 16, textAlign: "center" },
  wheelPicker: { height: wheelRowHeight * 5, justifyContent: "center" },
  durationWheel: { height: wheelRowHeight * 5, justifyContent: "center", alignItems: "center" },
  wheelFrame: { position: "absolute", left: 0, right: 0, top: wheelRowHeight * 2, height: wheelRowHeight, borderTopWidth: 1, borderBottomWidth: 1, backgroundColor: "rgba(255,255,255,0.07)" },
  wheelColumns: { flexDirection: "row", flex: 1, alignItems: "center", justifyContent: "center", gap: 7 },
  wheelColumn: { width: 82, height: wheelRowHeight * 5 },
  wheelList: { paddingVertical: wheelRowHeight * 2 },
  wheelRow: { height: wheelRowHeight, alignItems: "center", justifyContent: "center" },
  wheelValue: { fontSize: 19, fontWeight: "800" },
  wheelSeparator: { fontSize: 18, fontWeight: "900" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
