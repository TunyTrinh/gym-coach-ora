import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { Avatar, PrimaryButton, ScreenHeader, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { intervalsOverlap } from "@/lib/availability-shifts";
import { addMonths, buildMonthGrid, isSameLocalDay, localDayKey, startOfLocalDay, startOfMonth } from "@/lib/calendar";
import { useGym } from "@/lib/gym-store";
import { useLanguage } from "@/lib/language-provider";
import { isLocalTestMode } from "@/lib/local-test-mode";
import { adaptProductionSchedule } from "@/lib/production-schedule";
import { trpc } from "@/lib/trpc";
import { formatDateLocalized, formatTimeLocalized, localeFor } from "@/lib/i18n";
import { getBookingSlot, getCoach, getService } from "@/shared/gym";

const weekDayReference = new Date(2024, 0, 7);

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "C";
}

function blockColor(start: string) {
  const hour = new Date(start).getHours();
  return hour < 11 ? "#0b3f78" : hour < 15 ? "#164d22" : "#643c08";
}

function statusLabel(status: string, t: (key: any) => string) {
  if (status === "Completed") return t("completed");
  if (status === "Cancelled") return t("cancelled");
  if (status === "No-show") return t("noShow");
  if (status === "Booked" || status === "Confirmed") return t("booked");
  if (status === "Pending") return t("pending");
  return status;
}

type FeedbackSheet = {
  success: boolean;
  title: string;
  message: string;
};

export default function ScheduleScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { snapshot, upcomingBookings, cancelBooking, checkInBooking, markAttendance } = useGym();
  const { language, t } = useLanguage();
  const previewMode = isLocalTestMode();
  const role = previewMode ? snapshot.member.role : user?.role ?? "client";
  const isCoach = role === "coach";
  const [now, setNow] = useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
  const [feedbackSheet, setFeedbackSheet] = useState<FeedbackSheet | null>(null);
  const [cancellationBookingId, setCancellationBookingId] = useState<string | null>(null);
  const [cancellationBusy, setCancellationBusy] = useState(false);
  const memberSchedule = trpc.member.schedule.useQuery(undefined, { enabled: !previewMode && role === "client" });
  const coachSchedule = trpc.availability.coachSchedule.useQuery(undefined, { enabled: !previewMode && isCoach });
  const cancelServerBooking = trpc.availability.cancel.useMutation();
  const checkInServerBooking = trpc.availability.checkIn.useMutation();
  const markServerAttendance = trpc.availability.markAttendance.useMutation();
  const utils = trpc.useUtils();
  const activeSnapshot = useMemo(
    () => previewMode ? snapshot : adaptProductionSchedule(snapshot, { role, user, rows: isCoach ? (coachSchedule.data ?? []) : (memberSchedule.data ?? []) }),
    [coachSchedule.data, isCoach, memberSchedule.data, previewMode, role, snapshot, user],
  );
  const activeUpcomingBookings = useMemo(
    () => activeSnapshot.bookings.filter((booking) => booking.memberId === activeSnapshot.member.id && ["Confirmed", "Pending"].includes(booking.status) && new Date(getBookingSlot(activeSnapshot, booking)?.start ?? 0) > new Date()).sort((left, right) => new Date(getBookingSlot(activeSnapshot, left)?.start ?? 0).getTime() - new Date(getBookingSlot(activeSnapshot, right)?.start ?? 0).getTime()),
    [activeSnapshot],
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const calendarBookings = useMemo(() => {
    if (!isCoach) return previewMode ? upcomingBookings : activeUpcomingBookings;
    return activeSnapshot.bookings
      .sort((a, b) => new Date(getBookingSlot(activeSnapshot, a)?.start ?? 0).getTime() - new Date(getBookingSlot(activeSnapshot, b)?.start ?? 0).getTime());
  }, [activeSnapshot, activeUpcomingBookings, isCoach, previewMode, upcomingBookings]);

  const bookingsByDay = useMemo(() => {
    const result = new Map<string, typeof calendarBookings>();
    calendarBookings.forEach((booking) => {
      const slot = getBookingSlot(activeSnapshot, booking);
      if (!slot) return;
      const key = localDayKey(slot.start);
      result.set(key, [...(result.get(key) ?? []), booking]);
    });
    return result;
  }, [activeSnapshot, calendarBookings]);

  const calendarDays = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const selectedBookings = bookingsByDay.get(localDayKey(selectedDate)) ?? [];
  const monthTitle = new Intl.DateTimeFormat(localeFor(language), { month: "long", year: "numeric" }).format(visibleMonth);
  const selectedTitle = isSameLocalDay(selectedDate, now)
    ? t("today")
    : formatDateLocalized(selectedDate, language, { weekday: "long", month: "long", day: "numeric" });
  const weekDays = Array.from(
    { length: 7 },
    (_, index) => new Intl.DateTimeFormat(localeFor(language), { weekday: "short" }).format(new Date(weekDayReference.getTime() + index * 86_400_000)),
  );

  const resetToToday = () => {
    const today = startOfLocalDay(new Date());
    setSelectedDate(today);
    setVisibleMonth(startOfMonth(today));
  };

  const handleCancel = (bookingId: string) => {
    setCancellationBookingId(bookingId);
  };

  const confirmCancellation = async () => {
    const bookingId = cancellationBookingId;
    if (!bookingId || cancellationBusy) return;
    setCancellationBusy(true);
    const result = previewMode
      ? await cancelBooking(bookingId, "Plans changed")
      : await cancelServerBooking.mutateAsync({ bookingId, reason: "Plans changed" }).then(() => ({ success: true as const, message: "Booking cancelled and capacity released for that time." })).catch((error: unknown) => ({ success: false as const, error: error instanceof Error ? error.message : "This booking could not be cancelled." }));
    if (result.success && !previewMode) {
      await utils.member.schedule.invalidate();
      await utils.availability.coachSchedule.invalidate();
    }
    setCancellationBusy(false);
    setCancellationBookingId(null);
    setFeedbackSheet({
      success: result.success,
      title: result.success ? t("bookingCancelled") : t("couldNotCancel"),
      message: (result.success ? result.message : result.error) ?? t("couldNotCancel"),
    });
  };

  const handleCheckIn = async (bookingId: string) => {
    const result = previewMode
      ? await checkInBooking(bookingId)
      : await checkInServerBooking.mutateAsync({ bookingId }).then(() => ({ success: true as const, message: "You’re checked in. Have a great session." })).catch((error: unknown) => ({ success: false as const, error: error instanceof Error ? error.message : "Check-in is unavailable." }));
    if (result.success && !previewMode) await utils.member.schedule.invalidate();
    setFeedbackSheet({
      success: result.success,
      title: result.success ? t("checkedInAlert") : t("checkInUnavailable"),
      message: (result.success ? result.message : result.error) ?? t("checkInUnavailable"),
    });
  };

  const handleAttendance = async (bookingId: string, status: "Completed" | "No-show") => {
    const result = previewMode
      ? await markAttendance(bookingId, status)
      : await markServerAttendance.mutateAsync({ bookingId, status: status === "Completed" ? "completed" : "no_show" }).then(() => ({ success: true as const, message: status === "Completed" ? "Member marked completed." : "Member marked no-show." })).catch((error: unknown) => ({ success: false as const, error: error instanceof Error ? error.message : "Attendance could not be updated." }));
    if (result.success && !previewMode) await utils.availability.coachSchedule.invalidate();
    setFeedbackSheet({
      success: result.success,
      title: result.success ? t("attendanceSaved") : t("couldNotUpdateShift"),
      message: (result.success ? result.message : result.error) ?? t("couldNotUpdateShift"),
    });
  };

  if (role !== "client" && !isCoach) {
    return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <View style={styles.staffRestricted}>
        <ScreenHeader title={t("staffSchedule")} subtitle={t("staffScheduleSubtitle")} label={t("admin").toUpperCase()} />
        <SurfaceCard style={styles.staffCard}>
          <Text style={[styles.staffTitle, { color: colors.foreground }]}>{t("coachSchedule")}</Text>
          <Text style={[styles.staffCopy, { color: colors.muted }]}>{t("manageCoachTime")}</Text>
          <PrimaryButton title={t("openStaffWorkspace")} onPress={() => router.push("/book")} />
        </SurfaceCard>
      </View>
    </ScreenContainer>;
  }

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader
        title={isCoach ? t("coachSchedule") : t("scheduleTitle")}
        subtitle={isCoach ? t("manageCoachTime") : t("scheduleSubtitle")}
        label={isCoach ? t("coachLabel").toUpperCase() : t("scheduleHeader")}
      />

      {isCoach ? <SurfaceCard style={styles.coachActionCard}>
        <View style={styles.coachActionCopy}>
          <Text style={[styles.coachActionTitle, { color: colors.foreground }]}>{t("availabilityWorkspace")}</Text>
          <Text style={[styles.coachActionText, { color: colors.muted }]}>{t("manageCoachTime")}</Text>
        </View>
        <Pressable onPress={() => router.push("/book")} style={({ pressed }) => [styles.coachActionButton, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.coachActionButtonText}>{t("addAvailability")}</Text>
        </Pressable>
      </SurfaceCard> : null}

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
          const visibleBlocks = isCoach ? dayBookings.slice(0, 2) : [];
          const isSelected = isSameLocalDay(day, selectedDate);
          const isToday = isSameLocalDay(day, now);
          const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
          return <View key={key} style={styles.dayCell}>
            <Pressable
              onPress={() => { setSelectedDate(startOfLocalDay(day)); if (!isCurrentMonth) setVisibleMonth(startOfMonth(day)); }}
              accessibilityRole="button"
              accessibilityLabel={`${formatDateLocalized(day.toISOString(), language)}${dayBookings.length ? ` · ${dayBookings.length} ${dayBookings.length === 1 ? t("session") : t("sessions")}` : ""}`}
              style={({ pressed }) => [styles.dayButton, isSelected && styles.selectedDay, isToday && !isSelected && { borderColor: "#975bd7", borderWidth: 1 }, pressed && styles.pressed]}
            >
              <Text style={[styles.dayNumber, { color: isCurrentMonth ? colors.foreground : colors.muted }, isSelected && styles.selectedDayText]}>{day.getDate()}</Text>
              {isCoach ? <View style={styles.dayBlocks}>{visibleBlocks.map((booking) => {
                const slot = getBookingSlot(activeSnapshot, booking);
                return slot ? <View key={booking.id} style={[styles.miniBlock, { backgroundColor: blockColor(slot.start) }]}><Text numberOfLines={1} style={styles.miniBlockText}>{formatTimeLocalized(slot.start, language)}</Text></View> : null;
              })}{dayBookings.length > 2 ? <Text style={[styles.moreBlocks, { color: isSelected ? "#ffffff" : "#ff82b7"}]}>+{dayBookings.length - 2}</Text> : null}</View> : dayBookings.length > 0 ? <View style={[styles.bookingDot, { backgroundColor: dayBookings.length > 1 ? "#ff82b7" : "#8a77ef" }]}><Text style={styles.bookingDotText}>{dayBookings.length}</Text></View> : <View style={styles.dotSpacer} />}
            </Pressable>
          </View>;
        })}</View>
        <Text style={[styles.calendarHint, { color: colors.muted }]}>{t("calendarHint")}</Text>
      </SurfaceCard>

      <View style={styles.daySummaryHeader}>
        <View><Text style={[styles.summaryEyebrow, { color: "#a98af0" }]}>{t("selectedDay")}</Text><Text style={[styles.summaryTitle, { color: colors.foreground }]}>{selectedTitle}</Text></View>
        <Text style={[styles.summaryCount, { color: "#ff82b7" }]}>{selectedBookings.length} {selectedBookings.length === 1 ? t("session") : t("sessions")}</Text>
      </View>

      {selectedBookings.length === 0 ? <SurfaceCard style={styles.emptyCard}>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("nothingBooked")}</Text>
        <Text style={[styles.emptyMessage, { color: colors.muted }]}>{isCoach ? t("scheduleAppears") : t("chooseDayOrBook")}</Text>
        <PrimaryButton title={isCoach ? t("addAvailability") : t("browseSessions")} onPress={() => router.push(isCoach ? "/book" : "/book")} />
      </SurfaceCard> : selectedBookings.map((booking) => {
        const slot = getBookingSlot(activeSnapshot, booking);
        if (!slot) return null;
        const service = getService(activeSnapshot, slot.serviceTypeId);
        const coach = getCoach(activeSnapshot, slot.coachId);
        const bookingDuration = booking.durationMinutes ?? service?.durationMinutes ?? Math.round((new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60_000);
        const minutesUntil = Math.round((new Date(slot.start).getTime() - now.getTime()) / 60_000);
        const checkInOpen = minutesUntil <= 30 && minutesUntil >= -30;

        if (isCoach) {
          const window = activeSnapshot.availabilityShifts.find((item) => item.id === slot.availabilityShiftId);
          const concurrent = activeSnapshot.bookings.filter((item) => {
            if (!["Confirmed", "Pending"].includes(item.status)) return false;
            const other = getBookingSlot(activeSnapshot, item);
            return Boolean(other && other.availabilityShiftId === slot.availabilityShiftId && intervalsOverlap(slot.start, slot.end, other.start, other.end));
          }).length;
          const remaining = Math.max(0, (window?.maximumCapacity ?? slot.maximumCapacity) - concurrent);
          const clientName = booking.memberName ?? booking.memberId;
          return <SurfaceCard key={booking.id} style={styles.coachBookingCard}>
            <View style={styles.bookingTop}><View><Text style={[styles.bookingTime, { color: colors.foreground }]}>{formatTimeLocalized(slot.start, language)}–{formatTimeLocalized(slot.end, language)}</Text><Text style={[styles.bookingDate, { color: "#ff82b7" }]}>{bookingDuration} {t("minutes")} · {slot.room}</Text></View><StatusBadge label={statusLabel(booking.status, t)} tone={booking.status === "Confirmed" ? "success" : booking.status === "Pending" ? "warning" : "neutral"} /></View>
            <View style={[styles.timeBlock, { backgroundColor: blockColor(slot.start) }]}><Text style={styles.timeBlockTime}>{formatTimeLocalized(slot.start, language)}–{formatTimeLocalized(slot.end, language)}</Text><Text style={styles.timeBlockClient}>{clientName}</Text></View>
            <View style={styles.clientRow}><Avatar initials={initials(clientName)} accent="#b7e4dd" size={36} /><View style={styles.clientCopy}><Text style={[styles.clientName, { color: colors.foreground }]}>{clientName}</Text><Text style={[styles.clientMeta, { color: colors.muted }]}>{service?.name ?? t("session")}</Text></View></View>
            <View style={[styles.capacityPanel, { borderColor: colors.border, backgroundColor: colors.surface }]}><View><Text style={[styles.capacityValue, { color: colors.foreground }]}>{concurrent}</Text><Text style={[styles.capacityLabel, { color: colors.muted }]}>{t("concurrentBooked")}</Text></View><View style={styles.capacityRight}><Text style={[styles.capacityValue, { color: "#ff82b7" }]}>{remaining}</Text><Text style={[styles.capacityLabel, { color: colors.muted }]}>{t("remainingCapacity")}</Text></View></View>
            {booking.status === "Confirmed" ? <View style={styles.coachActions}><Pressable onPress={() => handleAttendance(booking.id, "Completed")} style={[styles.attendanceButton, { backgroundColor: `${colors.success}18` }]}><Text style={[styles.attendanceButtonText, { color: colors.success }]}>{t("markDone")}</Text></Pressable><Pressable onPress={() => handleAttendance(booking.id, "No-show")} style={[styles.attendanceButton, { backgroundColor: `${colors.error}14` }]}><Text style={[styles.attendanceButtonText, { color: colors.error }]}>{t("noShow")}</Text></Pressable></View> : null}
          </SurfaceCard>;
        }

        return <SurfaceCard key={booking.id} style={styles.bookingCard}>
          <View style={styles.bookingTop}><View><Text style={[styles.bookingTime, { color: colors.foreground }]}>{formatTimeLocalized(slot.start, language)} <Text style={[styles.bookingDuration, { color: colors.muted }]}>· {bookingDuration} {t("minutes")}</Text></Text><Text style={[styles.bookingDate, { color: "#ff82b7" }]}>{formatDateLocalized(slot.start, language, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</Text></View><StatusBadge label={booking.checkInTime ? t("checkedIn") : statusLabel(booking.status, t)} tone={booking.checkInTime ? "success" : "accent"} /></View>
          <View style={[styles.bookingRule, { backgroundColor: colors.border }]} />
          <View style={styles.bookingMain}>{coach ? <Avatar initials={coach.initials} accent={coach.accent} size={40} /> : <View style={styles.openIcon}><Text style={styles.openIconText}>⌁</Text></View>}<View style={styles.bookingCopy}><Text style={[styles.bookingService, { color: colors.foreground }]}>{service?.name}</Text><Text style={[styles.bookingCoach, { color: colors.muted }]}>{coach?.fullName ?? t("selfGuidedAccess")}</Text><Text style={[styles.bookingLocation, { color: colors.muted }]}>{slot.room}</Text></View></View>
          <View style={styles.actionRow}>{checkInOpen && !booking.checkInTime ? <View style={styles.actionFill}><PrimaryButton title={t("checkIn")} onPress={() => handleCheckIn(booking.id)} icon="checkmark.circle.fill" /></View> : <View style={styles.windowNote}><Text style={[styles.windowText, { color: colors.muted }]}>{booking.checkInTime ? t("checkInRecorded") : `${t("checkInOpens")} ${Math.max(1, minutesUntil - 30)} ${t("minutes")} `}</Text></View>}<Pressable onPress={() => handleCancel(booking.id)} accessibilityRole="button" accessibilityLabel={t("cancelBooking")} style={({ pressed }) => [styles.cancelButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.cancelText, { color: colors.error }]}>{t("cancel")}</Text></Pressable></View>
        </SurfaceCard>;
      })}
    </ScrollView>

    <Modal
      transparent
      visible={cancellationBookingId !== null}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => { if (!cancellationBusy) setCancellationBookingId(null); }}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("keepBooking")}
          onPress={() => { if (!cancellationBusy) setCancellationBookingId(null); }}
          style={styles.backdropDismiss}
        />
        <View style={[styles.confirmationSheet, { borderColor: colors.border }]}>
          <View style={[styles.confirmationIcon, { backgroundColor: `${colors.error}24` }]}>
            <Text style={[styles.confirmationIconText, { color: colors.error }]}>!</Text>
          </View>
          <Text style={[styles.confirmationTitle, { color: colors.foreground }]}>{t("cancelBookingPrompt")}</Text>
          <Text style={[styles.confirmationMessage, { color: colors.muted }]}>{t("cancelBookingBody")}</Text>
          <View style={styles.confirmationActions}>
            <Pressable
              accessibilityRole="button"
              disabled={cancellationBusy}
              onPress={() => setCancellationBookingId(null)}
              style={({ pressed }) => [styles.confirmationSecondaryButton, { borderColor: colors.border }, (pressed || cancellationBusy) && styles.confirmationButtonPressed]}
            >
              <Text style={[styles.confirmationSecondaryText, { color: colors.foreground }]}>{t("keepBooking")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={cancellationBusy}
              onPress={() => void confirmCancellation()}
              style={({ pressed }) => [styles.confirmationDestructiveButton, (pressed || cancellationBusy) && styles.confirmationButtonPressed]}
            >
              <Text style={styles.confirmationDestructiveText}>{cancellationBusy ? t("loading") : t("cancelBooking")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>

    <Modal
      transparent
      visible={feedbackSheet !== null}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setFeedbackSheet(null)}
    >
      <View style={styles.sheetBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("close")}
          onPress={() => setFeedbackSheet(null)}
          style={styles.backdropDismiss}
        />
        {feedbackSheet ? <View style={[styles.confirmationSheet, { borderColor: colors.border }]}>
          <View style={[styles.confirmationIcon, { backgroundColor: feedbackSheet.success ? `${colors.success}24` : `${colors.error}24` }]}>
            <Text style={[styles.confirmationIconText, { color: feedbackSheet.success ? colors.success : colors.error }]}>{feedbackSheet.success ? "✓" : "!"}</Text>
          </View>
          <Text style={[styles.confirmationTitle, { color: colors.foreground }]}>{feedbackSheet.title}</Text>
          <Text style={[styles.confirmationMessage, { color: colors.muted }]}>{feedbackSheet.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setFeedbackSheet(null)}
            style={({ pressed }) => [styles.confirmationButton, { backgroundColor: feedbackSheet.success ? "#e8f7ef" : "#ffe9e7" }, pressed && styles.confirmationButtonPressed]}
          >
            <Text style={[styles.confirmationButtonText, { color: feedbackSheet.success ? "#123d29" : "#6f1814" }]}>{t("close")}</Text>
          </Pressable>
        </View> : null}
      </View>
    </Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 16 },
  staffRestricted: { paddingTop: 10, gap: 18 }, staffCard: { gap: 12, padding: 19 }, staffTitle: { fontSize: 20, fontWeight: "900" }, staffCopy: { fontSize: 13, lineHeight: 20 },
  coachActionCard: { padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }, coachActionCopy: { flex: 1, gap: 3 }, coachActionTitle: { fontSize: 15, fontWeight: "900" }, coachActionText: { fontSize: 11, lineHeight: 16 }, coachActionButton: { paddingHorizontal: 12, minHeight: 36, borderRadius: 12, justifyContent: "center", backgroundColor: "#f04488" }, coachActionButtonText: { color: "#ffffff", fontSize: 11, fontWeight: "900" },
  calendarCard: { padding: 14, gap: 13 }, monthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }, monthEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, monthTitle: { fontSize: 19, fontWeight: "800", marginTop: 3 }, monthActions: { flexDirection: "row", alignItems: "center", gap: 6 }, iconButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" }, iconButtonText: { fontSize: 28, lineHeight: 28, marginTop: -3 }, todayButton: { height: 34, borderRadius: 17, borderWidth: 1, paddingHorizontal: 11, justifyContent: "center" }, todayButtonText: { fontSize: 11, fontWeight: "800" },
  weekRow: { flexDirection: "row" }, weekDay: { width: "14.285%", textAlign: "center", fontSize: 9, fontWeight: "800" }, grid: { flexDirection: "row", flexWrap: "wrap" }, dayCell: { width: "14.285%", aspectRatio: 0.88, padding: 2 }, dayButton: { flex: 1, alignItems: "center", borderRadius: 10, paddingTop: 4 }, selectedDay: { backgroundColor: "#5b2141" }, selectedDayText: { color: "#ffffff", fontWeight: "900" }, dayNumber: { fontSize: 12, fontWeight: "800" }, dayBlocks: { width: "100%", gap: 2, paddingHorizontal: 2, marginTop: 3 }, miniBlock: { minHeight: 13, borderRadius: 3, paddingHorizontal: 2, justifyContent: "center" }, miniBlockText: { color: "#ffffff", fontSize: 6.5, fontWeight: "900", textAlign: "center" }, moreBlocks: { fontSize: 7, fontWeight: "900", textAlign: "center", marginTop: 1 }, bookingDot: { minWidth: 14, height: 14, paddingHorizontal: 3, borderRadius: 7, alignItems: "center", justifyContent: "center", marginTop: 3 }, bookingDotText: { fontSize: 8, color: "#ffffff", fontWeight: "900" }, dotSpacer: { height: 14, marginTop: 3 }, calendarHint: { borderTopWidth: 1, borderTopColor: "#303036", paddingTop: 11, fontSize: 10, fontWeight: "700", textAlign: "center" },
  daySummaryHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 4 }, summaryEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, summaryTitle: { fontSize: 20, fontWeight: "800", marginTop: 3 }, summaryCount: { fontSize: 12, fontWeight: "800", marginBottom: 2 },
  bookingCard: { padding: 17, gap: 15 }, coachBookingCard: { padding: 16, gap: 12 }, bookingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }, bookingTime: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 }, bookingDuration: { fontSize: 12, fontWeight: "600", letterSpacing: 0 }, bookingDate: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 4 }, bookingRule: { height: 1 }, bookingMain: { flexDirection: "row", alignItems: "center", gap: 11 }, bookingCopy: { flex: 1, gap: 3 }, bookingService: { fontSize: 15, fontWeight: "800" }, bookingCoach: { fontSize: 12 }, bookingLocation: { fontSize: 11, marginTop: 2 }, openIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#282130" }, openIconText: { color: "#bba4ff", fontSize: 20 }, actionRow: { flexDirection: "row", alignItems: "center", gap: 9 }, actionFill: { flex: 1 }, windowNote: { flex: 1, minHeight: 44, borderRadius: 14, justifyContent: "center", paddingHorizontal: 12, backgroundColor: "#151518" }, windowText: { fontSize: 11, fontWeight: "700", lineHeight: 16 }, cancelButton: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, justifyContent: "center" }, cancelText: { fontSize: 12, fontWeight: "800" },
  timeBlock: { borderRadius: 12, padding: 11, gap: 4 }, timeBlockTime: { color: "#f7f7f8", fontSize: 14, fontWeight: "900" }, timeBlockClient: { color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "700" }, clientRow: { flexDirection: "row", alignItems: "center", gap: 10 }, clientCopy: { flex: 1 }, clientName: { fontSize: 14, fontWeight: "900" }, clientMeta: { fontSize: 11, marginTop: 3 }, capacityPanel: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", justifyContent: "space-between" }, capacityRight: { alignItems: "flex-end" }, capacityValue: { fontSize: 20, fontWeight: "900" }, capacityLabel: { fontSize: 11, marginTop: 2 }, coachActions: { flexDirection: "row", gap: 8 }, attendanceButton: { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 }, attendanceButtonText: { fontSize: 11, fontWeight: "900" },
  sheetBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, backgroundColor: "rgba(4, 5, 7, 0.72)" }, backdropDismiss: { ...StyleSheet.absoluteFillObject }, confirmationSheet: { width: "100%", maxWidth: 340, borderRadius: 26, borderWidth: 1, paddingHorizontal: 22, paddingTop: 25, paddingBottom: 18, alignItems: "center", backgroundColor: "#1d1d21", shadowColor: "#000000", shadowOpacity: 0.42, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 12 }, confirmationIcon: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginBottom: 17 }, confirmationIconText: { fontSize: 29, lineHeight: 33, fontWeight: "800" }, confirmationTitle: { fontSize: 20, lineHeight: 25, fontWeight: "800", textAlign: "center", letterSpacing: -0.3 }, confirmationMessage: { marginTop: 8, fontSize: 14, lineHeight: 20, textAlign: "center" }, confirmationActions: { alignSelf: "stretch", gap: 10, marginTop: 23 }, confirmationSecondaryButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#26262b" }, confirmationSecondaryText: { fontSize: 15, fontWeight: "800" }, confirmationDestructiveButton: { minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#ffe9e7" }, confirmationDestructiveText: { color: "#6f1814", fontSize: 15, fontWeight: "800" }, confirmationButton: { alignSelf: "stretch", minHeight: 46, borderRadius: 14, marginTop: 23, alignItems: "center", justifyContent: "center" }, confirmationButtonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] }, confirmationButtonText: { fontSize: 15, fontWeight: "800" },
  emptyCard: { padding: 22, gap: 10, alignItems: "flex-start" }, emptyTitle: { fontSize: 18, fontWeight: "800" }, emptyMessage: { fontSize: 13, lineHeight: 19, marginBottom: 4 }, pressed: { opacity: 0.7 },
});
