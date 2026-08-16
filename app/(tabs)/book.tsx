import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";

import AvailabilityScreen from "@/app/availability";
import { Avatar, GhostButton, PrimaryButton, ScreenHeader, SpectrumCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { intervalFitsAvailability, intervalsOverlap } from "@/lib/availability-shifts";
import { bookingFailureTranslationKey } from "@/lib/booking-feedback";
import { addMonths, buildMonthGrid, localDayKey, startOfLocalDay, startOfMonth } from "@/lib/calendar";
import { buildAdminPreviewRoomCalendar } from "@/lib/admin-room-preview";
import { useGym } from "@/lib/gym-store";
import { haptic } from "@/lib/haptics";
import { formatDateLocalized, formatTimeLocalized } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-provider";
import { isLocalTestMode } from "@/lib/local-test-mode";
import { createLocalDateRail, formatLocalClock, isSameLocalDay } from "@/lib/scheduler";
import { trpc } from "@/lib/trpc";
import { getBookingSlot, getCoach, type AvailabilityShift, type GymSnapshot } from "@/shared/gym";

const quickDurations = [30, 45, 60] as const;
const customDurations = Array.from({ length: 13 }, (_, index) => 60 + index * 15);
const wheelRowHeight = 44;
const clientWheelHours = Array.from({ length: 12 }, (_, index) => String(index + 1));
const clientWheelMinutes = ["00", "15", "30", "45"];
const clientWheelPeriods = ["AM", "PM"];

type TimeOption = { start: Date; end: Date; remaining: number; availabilityShiftId: string };
type Translation = ReturnType<typeof useLanguage>["t"];
type BookingFeedback = { title: string; message: string; tone: "success" | "error" };

function buildStartTimes(window: AvailabilityShift, duration: number, now: Date, snapshot: GymSnapshot): TimeOption[] {
  const start = new Date(window.start);
  const end = new Date(window.end);
  const first = new Date(start);
  first.setMinutes(Math.ceil(first.getMinutes() / 15) * 15, 0, 0);
  const options: TimeOption[] = [];

  for (let cursor = new Date(first); cursor.getTime() <= end.getTime(); cursor = new Date(cursor.getTime() + 15 * 60_000)) {
    const optionEnd = new Date(cursor.getTime() + duration * 60_000);
    if (!intervalFitsAvailability(cursor.toISOString(), optionEnd.toISOString(), start.toISOString(), end.toISOString())) continue;
    if (cursor.getTime() <= now.getTime()) continue;
    const overlapCount = snapshot.bookings.filter((booking) => {
      if (!['Confirmed', 'Pending'].includes(booking.status)) return false;
      const slot = getBookingSlot(snapshot, booking);
      return slot?.availabilityShiftId === window.id && intervalsOverlap(cursor.toISOString(), optionEnd.toISOString(), slot.start, slot.end);
    }).length;
    const remaining = Math.max(0, window.maximumCapacity - overlapCount);
    if (remaining > 0) options.push({ start: cursor, end: optionEnd, remaining, availabilityShiftId: window.id });
  }
  return options;
}

function clockValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function AdminBookingsCalendar() {
  const { user } = useAuth();
  const { snapshot } = useGym();
  const { language, t } = useLanguage();
  const colors = useColors();
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedRoomId, setSelectedRoomId] = useState<number | string | null>(null);
  const monthStart = startOfMonth(visibleMonth);
  const monthEnd = addMonths(monthStart, 1);
  const monthDays = buildMonthGrid(monthStart);
  const role = isLocalTestMode() ? snapshot.member.role : user?.role ?? "client";
  const hasAuthenticatedAdmin = user?.role === "admin";
  const isPreviewAdmin = isLocalTestMode() && role === "admin" && !hasAuthenticatedAdmin;
  const previewCalendar = useMemo(() => isPreviewAdmin ? buildAdminPreviewRoomCalendar(snapshot) : null, [isPreviewAdmin, snapshot]);
  const rooms = trpc.admin.listRooms.useQuery(undefined, { enabled: hasAuthenticatedAdmin });
  const selectedServerRoomId = typeof selectedRoomId === "number" ? selectedRoomId : 0;
  const schedule = trpc.admin.roomSchedule.useQuery(
    { roomId: selectedServerRoomId, from: monthStart.toISOString(), to: monthEnd.toISOString() },
    { enabled: hasAuthenticatedAdmin && selectedServerRoomId > 0 },
  );

  const previewRooms = previewCalendar?.rooms ?? [];
  const roomOptions = rooms.data?.length ? rooms.data : previewRooms;

  const roomWindows = isPreviewAdmin
    ? previewCalendar?.windows.filter((window) => window.roomId === String(selectedRoomId)) ?? []
    : schedule.data?.windows ?? [];
  const selectedPreviewWindowIds = new Set(roomWindows.map((window) => window.id));
  const roomBookings = isPreviewAdmin
    ? previewCalendar?.bookings.filter((booking) => selectedPreviewWindowIds.has(booking.availabilityId)) ?? []
    : schedule.data?.bookings ?? [];
  const dailyActivity = new Map<string, { open: number; booked: number }>();
  roomWindows.forEach((window) => {
    const key = localDayKey(window.startAt);
    const current = dailyActivity.get(key) ?? { open: 0, booked: 0 };
    if (window.status.toLowerCase() === "available") current.open += 1;
    current.booked += roomBookings.filter((booking) => booking.availabilityId === window.id).length;
    dailyActivity.set(key, current);
  });
  const selectedActivity = dailyActivity.get(localDayKey(selectedDate)) ?? { open: 0, booked: 0 };
  const selectedWindows = roomWindows.filter((window) => isSameLocalDay(new Date(window.startAt), selectedDate));

  useEffect(() => {
    if (!selectedRoomId && roomOptions[0]) setSelectedRoomId(roomOptions[0].id);
  }, [roomOptions, selectedRoomId]);

  if (role !== "admin") return null;

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.adminBookingsContent} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={t("adminBookingsCalendar")} subtitle={t("adminBookingsCalendarBody")} label={t("admin").toUpperCase()} />
      <Text style={[styles.stepLabel, { color: colors.muted }]}>{t("selectRoom").toUpperCase()}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminRoomRail}>
        {rooms.isLoading && !isPreviewAdmin ? <ActivityIndicator color="#ff82b7" /> : roomOptions.map((room) => <Pressable key={room.id} onPress={() => setSelectedRoomId(room.id)} style={({ pressed }) => [styles.adminRoomPill, { borderColor: String(room.id) === String(selectedRoomId) ? "#f04488" : colors.border, backgroundColor: String(room.id) === String(selectedRoomId) ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}>
          <Text style={[styles.adminRoomName, { color: String(room.id) === String(selectedRoomId) ? "#ff82b7" : colors.foreground }]}>{room.name}</Text>
          <Text style={[styles.adminRoomMeta, { color: colors.muted }]}>{room.maximumCapacity} {t("clients").toLowerCase()}</Text>
        </Pressable>)}
      </ScrollView>
      {!rooms.isLoading && !roomOptions.length ? <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyCopy, { color: colors.muted }]}>{t("noRooms")}</Text></SurfaceCard> : null}
      {selectedRoomId ? <><SurfaceCard style={styles.adminCalendarCard}><View style={styles.monthCalendarHeading}><Text style={[styles.stepLabel, { color: colors.muted }]}>{t("chooseDay").toUpperCase()}</Text><View style={styles.monthNavigation}><Pressable accessibilityLabel={t("previousMonth")} onPress={() => setVisibleMonth((month) => addMonths(month, -1))} style={({ pressed }) => [styles.monthArrow, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><Text style={[styles.monthArrowText, { color: colors.foreground }]}>‹</Text></Pressable><Text style={[styles.monthTitle, { color: colors.foreground }]}>{formatDateLocalized(monthStart.toISOString(), language, { month: "long", year: "numeric" })}</Text><Pressable accessibilityLabel={t("nextMonth")} onPress={() => setVisibleMonth((month) => addMonths(month, 1))} style={({ pressed }) => [styles.monthArrow, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><Text style={[styles.monthArrowText, { color: colors.foreground }]}>›</Text></Pressable></View></View>
        <View style={styles.monthWeekdays}>{monthDays.slice(0, 7).map((day) => <Text key={day.toISOString()} style={[styles.monthWeekday, { color: colors.muted }]}>{new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", { weekday: "narrow" }).format(day).toUpperCase()}</Text>)}</View><View style={styles.monthGrid}>{monthDays.map((day) => { const active = isSameLocalDay(day, selectedDate); const inMonth = day.getMonth() === monthStart.getMonth(); const activity = dailyActivity.get(localDayKey(day)) ?? { open: 0, booked: 0 }; return <Pressable key={day.toISOString()} onPress={() => { setSelectedDate(startOfLocalDay(day)); if (!inMonth) setVisibleMonth(startOfMonth(day)); }} style={({ pressed }) => [styles.monthDay, { borderColor: active ? "#f04488" : colors.border, backgroundColor: active ? "#2b1f2a" : colors.surface, opacity: inMonth ? 1 : 0.42 }, pressed && styles.pressed]}><Text style={[styles.monthDayNumber, { color: active ? "#ff82b7" : colors.foreground }]}>{day.getDate()}</Text>{activity.open || activity.booked ? <View style={styles.monthActivity}><View style={[styles.monthDot, { backgroundColor: "#32d77b" }]} /><Text style={[styles.monthActivityCount, { color: colors.muted }]}>{activity.open}</Text><View style={[styles.monthDot, { backgroundColor: "#f04488" }]} /><Text style={[styles.monthActivityCount, { color: colors.muted }]}>{activity.booked}</Text></View> : <View style={styles.monthActivitySpacer} />}</Pressable>; })}</View></SurfaceCard>
        <SpectrumCard style={styles.activitySummary} intensity="muted"><Text style={styles.activityDate}>{formatDateLocalized(selectedDate.toISOString(), language, { weekday: "long", month: "short", day: "numeric" })}</Text><View style={styles.activityStats}><View style={styles.activityStat}><Text style={styles.activityNumber}>{selectedActivity.open}</Text><Text style={styles.activityLabel}>{t("openAvailabilityCount")}</Text></View><View style={styles.activityDivider} /><View style={styles.activityStat}><Text style={styles.activityNumber}>{selectedActivity.booked}</Text><Text style={styles.activityLabel}>{t("bookedSessionCount")}</Text></View></View></SpectrumCard>
        {schedule.isLoading && !isPreviewAdmin ? <ActivityIndicator color="#ff82b7" style={styles.activityLoading} /> : selectedWindows.length ? <View style={styles.adminWindowList}>{selectedWindows.map((window) => { const participants = roomBookings.filter((booking) => booking.availabilityId === window.id); return <SurfaceCard key={window.id} style={styles.adminWindowCard}><View style={styles.adminWindowTop}><View><Text style={[styles.windowTime, { color: colors.foreground }]}>{formatTimeLocalized(window.startAt, language)}–{formatTimeLocalized(window.endAt, language)}</Text><Text style={[styles.windowHint, { color: colors.muted }]}>{window.coachName} · {window.location}</Text></View><StatusBadge label={window.status.toLowerCase() === "available" ? t("available") : window.status} tone={window.status.toLowerCase() === "available" ? "success" : "warning"} /></View><Text style={[styles.adminWindowMeta, { color: colors.muted }]}>{participants.length}/{window.maximumCapacity} {t("clients").toLowerCase()} · {participants.length} {t("bookedSessionCount").toLowerCase()}</Text>{participants.map((participant) => <View key={participant.id} style={[styles.adminParticipant, { borderTopColor: colors.border }]}><Text style={[styles.adminParticipantName, { color: colors.foreground }]}>{participant.clientName ?? "—"}</Text><Text style={[styles.adminParticipantMeta, { color: colors.muted }]}>{participant.status}{participant.checkInTime ? ` · ${t("attendance")}` : ""}</Text></View>)}</SurfaceCard>; })}</View> : <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyCopy, { color: colors.muted }]}>{t("noRoomActivity")}</Text></SurfaceCard>}</> : null}
    </ScrollView>
  </ScreenContainer>;
}

export default function BookScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { snapshot, bookAvailability } = useGym();
  const { language, t } = useLanguage();
  const previewMode = isLocalTestMode();
  const role = previewMode ? snapshot.member.role : user?.role ?? "client";
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
  const [bookingFeedback, setBookingFeedback] = useState<BookingFeedback | null>(null);
  const availabilityRange = useMemo(() => {
    const start = startOfLocalDay(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 8);
    return { dateStart: start.toISOString(), dateEnd: end.toISOString() };
  }, [now]);
  const productionAvailability = trpc.availability.bookableAll.useQuery(availabilityRange, { enabled: !previewMode && role === "client" });
  const productionBooking = trpc.availability.book.useMutation();
  const utils = trpc.useUtils();
  const activeSnapshot = useMemo(() => {
    if (previewMode) return snapshot;
    const serverWindows = productionAvailability.data ?? [];
    const coachById = new Map<number, { id: string; fullName: string; specialty: string; initials: string; accent: string; active: boolean }>();
    for (const window of serverWindows) {
      if (!coachById.has(window.coachId)) {
        const initials = window.coachName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "C";
        coachById.set(window.coachId, { id: String(window.coachId), fullName: window.coachName, specialty: window.coachSpecialty, initials, accent: "#9660bd", active: true });
      }
    }
    return {
      ...snapshot,
      member: { ...snapshot.member, id: user?.id ? `member-${user.id}` : "member-anonymous", fullName: user?.name?.trim() || "Coachora member", email: user?.email ?? "", initials: user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CM", role },
      coaches: [...coachById.values()],
      availabilityShifts: serverWindows.map((window) => ({
        id: window.id,
        gymId: "database-gym",
        coachId: String(window.coachId),
        roomId: window.roomId ? String(window.roomId) : undefined,
        serviceTypeId: String(window.serviceTypeId),
        start: new Date(window.startAt).toISOString(),
        end: new Date(window.endAt).toISOString(),
        maximumCapacity: window.maximumCapacity,
        location: window.location,
        note: window.note ?? undefined,
        status: "Available" as const,
        createdBy: "database",
      })),
      bookings: [],
    };
  }, [previewMode, productionAvailability.data, role, snapshot, user]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const days = createLocalDateRail(now, 7);
  const selectedDate = days[selectedDay] ?? days[0];
  const windows = useMemo(
    () => activeSnapshot.availabilityShifts
      .filter((window) => window.status === "Available" && isSameLocalDay(new Date(window.start), selectedDate) && new Date(window.end) > now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [activeSnapshot.availabilityShifts, now, selectedDate],
  );
  const selectedWindow = windows.find((window) => window.id === selectedWindowId) ?? null;
  const selectedCoachWindows = useMemo(
    () => selectedWindow ? windows.filter((window) => window.coachId === selectedWindow.coachId) : [],
    [selectedWindow, windows],
  );
  const timeOptions = useMemo(
    () => selectedCoachWindows.flatMap((window) => buildStartTimes(window, duration, now, activeSnapshot)),
    [activeSnapshot, duration, now, selectedCoachWindows],
  );
  const selectedOption = timeOptions.find((option) => option.start.getTime() === selectedStart?.getTime()) ?? null;
  const selectedBookingWindow = selectedOption
    ? selectedCoachWindows.find((window) => window.id === selectedOption.availabilityShiftId) ?? selectedWindow
    : selectedWindow;

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
    if (!selectedBookingWindow || !selectedOption) return;
    setBusy(true);
    try {
      const result = previewMode
        ? await bookAvailability(selectedBookingWindow.id, selectedOption.start.toISOString(), duration)
        : await productionBooking.mutateAsync({ windowId: selectedBookingWindow.id, startAt: selectedOption.start.toISOString(), durationMinutes: duration })
          .then(() => ({ success: true as const, message: "You’re booked. Your session is now in My Schedule." }))
          .catch((error: unknown) => ({ success: false as const, error: error instanceof Error ? error.message : "That time is no longer available." }));
      if (result.success) {
        if (!previewMode) {
          await utils.availability.bookableAll.invalidate();
          await utils.member.schedule.invalidate();
        }
        haptic.success();
        setShowReview(false);
        setSelectedStart(null);
        setBookingFeedback({ title: t("youreBooked"), message: result.message ?? t("bookingConfirmedToast"), tone: "success" });
      } else {
        haptic.error();
        setShowReview(false);
        setBookingFeedback({ title: t("couldntBook"), message: t(bookingFailureTranslationKey(result.error)), tone: "error" });
      }
    } catch {
      haptic.error();
      setShowReview(false);
      setBookingFeedback({ title: t("couldntBook"), message: t("bookingUnavailable"), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (role === "admin") return <AdminBookingsCalendar />;
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
              const hasAvailability = activeSnapshot.availabilityShifts.some((window) => window.status === "Available" && isSameLocalDay(new Date(window.start), day) && new Date(window.end) > now);
              return <Pressable onPress={() => setSelectedDay(index)} style={({ pressed }) => [styles.dateCard, { backgroundColor: active ? "#2b1f2a" : colors.surface, borderColor: active ? "#f04488" : colors.border }, pressed && styles.pressed]}>
                <Text style={[styles.dateWeekday, { color: active ? "#ff82b7" : colors.muted }]}>{isSameLocalDay(day, now) ? t("today").toUpperCase() : new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", { weekday: "short" }).format(day).toUpperCase()}</Text>
                <Text style={[styles.dateNumber, { color: colors.foreground }]}>{day.getDate()}</Text>
                {hasAvailability ? <View style={styles.dateDot} /> : null}
              </Pressable>;
            }}
          />
          <Text style={[styles.stepLabel, { color: colors.muted }]}>2. {t("chooseAvailability")}</Text>
        </View>

        {productionAvailability.isLoading && !previewMode ? <ActivityIndicator color="#ff82b7" style={styles.activityLoading} /> : windows.length ? <View style={styles.windowList}>{windows.map((window) => <AvailabilityCard key={window.id} window={window} selected={selectedWindowId === window.id} snapshot={activeSnapshot} language={language} t={t} colors={colors} onPress={() => { setSelectedWindowId(window.id); setSelectedStart(null); }} />)}</View> : <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noAvailabilityYet")}</Text><Text style={[styles.emptyCopy, { color: colors.muted }]}>{t("noSlotsAvailable")}</Text></SurfaceCard>}

        {selectedWindow ? <View style={styles.bookingPanel}>
          <Text style={[styles.stepLabel, { color: colors.muted }]}>3. {t("sessionDuration")}</Text>
          <View style={styles.durationRail}>
            {quickDurations.map((item) => <Pressable key={item} onPress={() => selectQuickDuration(item)} style={({ pressed }) => [styles.durationChip, { borderColor: !customDurationSelected && duration === item ? "#f04488" : colors.border, backgroundColor: !customDurationSelected && duration === item ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><Text style={[styles.durationText, { color: !customDurationSelected && duration === item ? "#ff82b7" : colors.foreground }]}>{item} {t("minutes")}</Text></Pressable>)}
            <Pressable onPress={openCustomDuration} style={({ pressed }) => [styles.durationChip, { borderColor: customDurationSelected ? "#f04488" : colors.border, backgroundColor: customDurationSelected ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><Text style={[styles.durationText, { color: customDurationSelected ? "#ff82b7" : colors.foreground }]}>{customDurationSelected ? `${t("otherDuration")} · ${duration}m` : t("otherDuration")}</Text></Pressable>
          </View>

          <View style={styles.timeHeading}>
            <Text style={[styles.stepLabel, { color: colors.muted }]}>4. {t("chooseStartTime")}</Text>
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

      <BookingReview visible={showReview} window={selectedBookingWindow} option={selectedOption} duration={duration} colors={colors} language={language} t={t} busy={busy} onClose={() => setShowReview(false)} onBook={handleBook} />
      <BookingFeedbackSheet feedback={bookingFeedback} colors={colors} t={t} onClose={() => setBookingFeedback(null)} />
      <DurationPicker visible={showDurationPicker} value={durationDraft} colors={colors} t={t} onChange={setDurationDraft} onClose={() => setShowDurationPicker(false)} onSave={saveCustomDuration} />
      <StartTimePicker visible={showTimePicker} value={timeDraft} colors={colors} t={t} error={timeError} onChange={setTimeDraft} onClose={() => setShowTimePicker(false)} onSave={saveStartTime} />
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

function BookingFeedbackSheet({ feedback, colors, t, onClose }: { feedback: BookingFeedback | null; colors: ReturnType<typeof useColors>; t: Translation; onClose: () => void }) {
  const success = feedback?.tone === "success";
  return <Modal visible={Boolean(feedback)} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={[styles.resultSheet, { backgroundColor: "#151518", borderColor: success ? "#32d77b" : "#f04488" }]}><View style={[styles.resultIcon, { backgroundColor: success ? "#173629" : "#3a1f2b" }]}><Text style={[styles.resultIconText, { color: success ? "#5ce49a" : "#ff82b7" }]}>{success ? "✓" : "!"}</Text></View><Text style={[styles.resultTitle, { color: colors.foreground }]}>{feedback?.title}</Text><Text style={[styles.resultMessage, { color: colors.muted }]}>{feedback?.message}</Text><View style={styles.resultAction}><PrimaryButton title={t("bookingFeedbackDone")} onPress={onClose} /></View></View></View></Modal>;
}

function DurationPicker({ visible, value, colors, t, onChange, onClose, onSave }: { visible: boolean; value: number; colors: ReturnType<typeof useColors>; t: Translation; onChange: (value: number) => void; onClose: () => void; onSave: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.pickerBackdrop}><View style={[styles.pickerSheet, { backgroundColor: "#151518", borderColor: colors.border }]}><PickerHeader title={t("chooseCustomDuration")} t={t} onClose={onClose} onSave={onSave} /><Text style={[styles.pickerHint, { color: colors.muted }]}>{t("customDurationHint")}</Text><DurationWheel value={value} onChange={onChange} colors={colors} t={t} /></View></View></Modal>;
}

function clockParts(value: string) {
  const [rawHour, rawMinute] = value.split(":").map(Number);
  const hour = Number.isFinite(rawHour) ? rawHour : 9;
  const minute = Number.isFinite(rawMinute) ? rawMinute : 0;
  return { hour: String(hour % 12 || 12), minute: String(minute).padStart(2, "0"), period: hour >= 12 ? "PM" : "AM" };
}

function clockFromParts(hour: string, minute: string, period: string) {
  const hour24 = (Number(hour) % 12) + (period === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${minute}`;
}

function StartTimePicker({ visible, value, colors, t, error, onChange, onClose, onSave }: { visible: boolean; value: string; colors: ReturnType<typeof useColors>; t: Translation; error: boolean; onChange: (value: string) => void; onClose: () => void; onSave: () => void }) {
  const parts = clockParts(value);
  const update = (field: "hour" | "minute" | "period", next: string) => {
    const all = { ...parts, [field]: next };
    onChange(clockFromParts(all.hour, all.minute, all.period));
  };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.pickerBackdrop}><View style={[styles.pickerSheet, { backgroundColor: "#151518", borderColor: colors.border }]}><PickerHeader title={t("chooseStartTime")} t={t} onClose={onClose} onSave={onSave} /><View style={styles.wheelPicker}><View pointerEvents="none" style={[styles.wheelFrame, { borderColor: colors.border }]} /><View style={styles.wheelColumns}><WheelColumn options={clientWheelHours} selectedIndex={clientWheelHours.indexOf(parts.hour)} onChange={(index) => update("hour", clientWheelHours[index])} colors={colors} emphasizeSelected /><Text style={[styles.wheelSeparator, { color: colors.muted }]}>:</Text><WheelColumn options={clientWheelMinutes} selectedIndex={clientWheelMinutes.indexOf(parts.minute)} onChange={(index) => update("minute", clientWheelMinutes[index])} colors={colors} emphasizeSelected /><WheelColumn options={clientWheelPeriods} selectedIndex={clientWheelPeriods.indexOf(parts.period)} onChange={(index) => update("period", clientWheelPeriods[index])} colors={colors} emphasizeSelected /></View></View>{error ? <Text style={styles.timeWarning}>{t("selectedTimeOutsideAvailability")}</Text> : null}</View></View></Modal>;
}

function PickerHeader({ title, t, onClose, onSave }: { title: string; t: Translation; onClose: () => void; onSave: () => void }) {
  return <View style={styles.pickerHeader}><Pressable onPress={onClose} style={styles.pickerAction}><Text style={styles.pickerActionText}>{t("cancel")}</Text></Pressable><Text style={styles.pickerTitle}>{title}</Text><Pressable onPress={onSave} style={[styles.pickerAction, styles.pickerSave]}><Text style={styles.pickerActionText}>{t("save")}</Text></Pressable></View>;
}

function WheelColumn<T>({ options, selectedIndex, onChange, colors, renderLabel, columnStyle, rowStyle, valueStyle, emphasizeSelected = false }: { options: readonly T[]; selectedIndex: number; onChange: (index: number) => void; colors: ReturnType<typeof useColors>; renderLabel?: (value: T) => string; columnStyle?: StyleProp<ViewStyle>; rowStyle?: StyleProp<ViewStyle>; valueStyle?: StyleProp<TextStyle>; emphasizeSelected?: boolean }) {
  const ref = useRef<FlatList<T>>(null);
  const isDragging = useRef(false);
  const lastOffset = useRef(0);
  const webSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isDragging.current) return;
    const frame = requestAnimationFrame(() => ref.current?.scrollToOffset({ offset: Math.max(0, selectedIndex) * wheelRowHeight, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [selectedIndex]);
  useEffect(() => () => { if (webSettleTimer.current) clearTimeout(webSettleTimer.current); }, []);
  const settleAtOffset = (offset: number) => {
    const index = Math.max(0, Math.min(options.length - 1, Math.round(offset / wheelRowHeight)));
    isDragging.current = false;
    ref.current?.scrollToOffset({ offset: index * wheelRowHeight, animated: true });
    onChange(index);
  };
  const finish = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    settleAtOffset(event.nativeEvent.contentOffset.y);
  };
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS !== "web") return;
    isDragging.current = true;
    lastOffset.current = event.nativeEvent.contentOffset.y;
    if (webSettleTimer.current) clearTimeout(webSettleTimer.current);
    webSettleTimer.current = setTimeout(() => settleAtOffset(lastOffset.current), 90);
  };
  return <FlatList ref={ref} data={[...options]} keyExtractor={(_, index) => String(index)} style={[styles.wheelColumn, columnStyle]} contentContainerStyle={styles.wheelList} showsVerticalScrollIndicator={false} snapToInterval={wheelRowHeight} snapToAlignment="center" disableIntervalMomentum decelerationRate="fast" onScrollBeginDrag={() => { isDragging.current = true; }} onScroll={handleScroll} scrollEventThrottle={16} onMomentumScrollEnd={Platform.OS === "web" ? undefined : finish} onScrollEndDrag={Platform.OS === "web" ? () => { if (webSettleTimer.current) clearTimeout(webSettleTimer.current); webSettleTimer.current = setTimeout(() => settleAtOffset(lastOffset.current), 40); } : undefined} getItemLayout={(_, index) => ({ length: wheelRowHeight, offset: wheelRowHeight * index, index })} renderItem={({ item, index }) => <View style={[styles.wheelRow, rowStyle]}><Text numberOfLines={1} ellipsizeMode="clip" style={[styles.wheelValue, valueStyle, { color: index === selectedIndex ? "#ff82b7" : colors.muted, opacity: index === selectedIndex ? 1 : 0.42 }, emphasizeSelected && index === selectedIndex ? styles.wheelValueSelected : null]}>{renderLabel ? renderLabel(item) : String(item)}</Text></View>} />;
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
  resultSheet: { width: "88%", maxWidth: 420, borderRadius: 24, borderWidth: 1, padding: 24, alignItems: "center" },
  resultIcon: { width: 50, height: 50, borderRadius: 25, justifyContent: "center", alignItems: "center", marginBottom: 14 },
  resultIconText: { fontSize: 26, fontWeight: "900" },
  resultTitle: { fontSize: 20, fontWeight: "900", textAlign: "center" },
  resultMessage: { fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
  resultAction: { width: "100%", marginTop: 20 },
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
  startTimeWheel: { height: wheelRowHeight * 5, justifyContent: "center", alignItems: "stretch" },
  wheelFrame: { position: "absolute", left: 0, right: 0, top: wheelRowHeight * 2, height: wheelRowHeight, borderTopWidth: 1, borderBottomWidth: 1, backgroundColor: "rgba(255,255,255,0.07)" },
  wheelColumns: { flexDirection: "row", flex: 1, alignItems: "center", justifyContent: "center", gap: 7 },
  wheelColumn: { width: 82, height: wheelRowHeight * 5 },
  startTimeColumn: { width: "100%" },
  wheelList: { paddingVertical: wheelRowHeight * 2 },
  wheelRow: { height: wheelRowHeight, alignItems: "center", justifyContent: "center" },
  startTimeRow: { alignItems: "center", paddingHorizontal: 0 },
  wheelValue: { fontSize: 19, fontWeight: "800" },
  startTimeValue: { width: "100%", textAlign: "center", includeFontPadding: false },
  wheelValueSelected: { fontSize: 22, fontWeight: "900", transform: [{ scale: 1.04 }] },
  wheelSeparator: { fontSize: 18, fontWeight: "900" },
  adminBookingsContent: { paddingTop: 2, paddingBottom: 30, gap: 13 },
  adminRoomRail: { gap: 8, paddingRight: 14 },
  adminRoomPill: { minWidth: 132, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  adminRoomName: { fontSize: 13, fontWeight: "900" },
  adminRoomMeta: { fontSize: 10, marginTop: 3 },
  adminCalendarCard: { padding: 14, gap: 13 },
  activitySummary: { gap: 12 },
  activityDate: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  activityStats: { flexDirection: "row", alignItems: "stretch" },
  activityStat: { flex: 1, gap: 3 },
  activityNumber: { color: "#ffffff", fontSize: 27, fontWeight: "900" },
  activityLabel: { color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: "800" },
  activityDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.22)", marginHorizontal: 14 },
  activityLoading: { marginTop: 16 },
  adminWindowList: { gap: 10 },
  adminWindowCard: { gap: 9 },
  adminWindowTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  adminWindowMeta: { fontSize: 11, fontWeight: "700" },
  adminParticipant: { paddingTop: 8, borderTopWidth: 1, gap: 2 },
  adminParticipantName: { fontSize: 12, fontWeight: "800" },
  adminParticipantMeta: { fontSize: 10 },
  monthCalendarHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  monthNavigation: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" },
  monthArrow: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  monthArrowText: { fontSize: 20, fontWeight: "700", lineHeight: 24 },
  monthTitle: { fontSize: 14, fontWeight: "900", flex: 1, textAlign: "center" },
  monthWeekdays: { flexDirection: "row" },
  monthWeekday: { width: "14.285%", textAlign: "center", fontSize: 9, fontWeight: "800" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap" },
  monthDay: { width: "14.285%", aspectRatio: 0.88, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "flex-start", paddingTop: 4 },
  monthDayNumber: { fontSize: 12, fontWeight: "800" },
  monthActivity: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 3 },
  monthDot: { width: 4, height: 4, borderRadius: 2 },
  monthActivityCount: { fontSize: 8, fontWeight: "700" },
  monthActivitySpacer: { height: 14, marginTop: 3 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
