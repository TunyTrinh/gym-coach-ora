import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import { Avatar, PrimaryButton, ScreenHeader, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { intervalsOverlap } from "@/lib/availability-shifts";
import { addMonths, buildMonthGrid, isSameLocalDay, localDayKey, startOfLocalDay, startOfMonth } from "@/lib/calendar";
import { useLanguage } from "@/lib/language-provider";
import { adaptProductionSchedule } from "@/lib/production-schedule";
import { trpc } from "@/lib/trpc";
import { formatDateLocalized, formatTimeLocalized, localeFor } from "@/lib/i18n";
import { getBookingSlot, getCoach } from "@/shared/gym";
import { roomStatusPresentation, visibleRoomCalendarMarkers, type RoomStatusMarker } from "@/shared/room-status-presentation";

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
  const { language, t } = useLanguage();
  const role = user?.role ?? "client";
  const isCoach = role === "coach";
  const [now, setNow] = useState(() => new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
  const [roomFilterId, setRoomFilterId] = useState<number | "all">("all");
  const [feedbackSheet, setFeedbackSheet] = useState<FeedbackSheet | null>(null);
  const [cancellationBookingId, setCancellationBookingId] = useState<string | null>(null);
  const [cancellationBusy, setCancellationBusy] = useState(false);
  const memberSchedule = trpc.member.schedule.useQuery(undefined, { enabled: role === "client" });
  const coachSchedule = trpc.availability.coachSchedule.useQuery(undefined, { enabled: isCoach });
  const roomCalendarMonthEnd = useMemo(() => {
    const lastDay = addMonths(visibleMonth, 1);
    lastDay.setDate(lastDay.getDate() - 1);
    return lastDay;
  }, [visibleMonth]);
  const roomCalendarQuery = trpc.availability.roomCalendar.useQuery(
    roomFilterId === "all"
      ? { from: localDayKey(visibleMonth), to: localDayKey(roomCalendarMonthEnd) }
      : { from: localDayKey(visibleMonth), to: localDayKey(roomCalendarMonthEnd), roomId: roomFilterId },
    { enabled: isCoach },
  );
  const roomScheduleQuery = trpc.availability.roomSchedule.useQuery(
    { date: localDayKey(selectedDate) },
    { enabled: isCoach },
  );
  const cancelServerBooking = trpc.availability.cancel.useMutation();
  const checkInServerBooking = trpc.availability.checkIn.useMutation();
  const markServerAttendance = trpc.availability.markAttendance.useMutation();
  const utils = trpc.useUtils();
  const activeSnapshot = useMemo(
    () => adaptProductionSchedule({ role, user, rows: isCoach ? (coachSchedule.data ?? []) : (memberSchedule.data ?? []) }),
    [coachSchedule.data, isCoach, memberSchedule.data, role, user],
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
    if (!isCoach) return activeUpcomingBookings;
    return activeSnapshot.bookings
      .sort((a, b) => new Date(getBookingSlot(activeSnapshot, a)?.start ?? 0).getTime() - new Date(getBookingSlot(activeSnapshot, b)?.start ?? 0).getTime());
  }, [activeSnapshot, activeUpcomingBookings, isCoach]);

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
    const result = await cancelServerBooking.mutateAsync({ bookingId, reason: "Plans changed" }).then(() => ({ success: true as const, message: "Booking cancelled and capacity released for that time." })).catch((error: unknown) => ({ success: false as const, error: error instanceof Error ? error.message : "This booking could not be cancelled." }));
    if (result.success) {
      await Promise.all([utils.member.schedule.invalidate(), utils.availability.coachSchedule.invalidate(), utils.availability.mine.invalidate(), utils.availability.bookable.invalidate(), utils.availability.bookableAll.invalidate(), utils.availability.previewCapacity.invalidate(), utils.availability.previewRoomCapacity.invalidate(), utils.availability.roomSchedule.invalidate(), utils.availability.roomCalendar.invalidate(), utils.admin.roomSchedule.invalidate()]);
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
    const result = await checkInServerBooking.mutateAsync({ bookingId }).then(() => ({ success: true as const, message: "You’re checked in. Have a great session." })).catch((error: unknown) => ({ success: false as const, error: error instanceof Error ? error.message : "Check-in is unavailable." }));
    if (result.success) await utils.member.schedule.invalidate();
    setFeedbackSheet({
      success: result.success,
      title: result.success ? t("checkedInAlert") : t("checkInUnavailable"),
      message: (result.success ? result.message : result.error) ?? t("checkInUnavailable"),
    });
  };

  const handleAttendance = async (bookingId: string, status: "Completed" | "No-show") => {
    const result = await markServerAttendance.mutateAsync({ bookingId, status: status === "Completed" ? "completed" : "no_show" }).then(() => ({ success: true as const, message: status === "Completed" ? "Member marked completed." : "Member marked no-show." })).catch((error: unknown) => ({ success: false as const, error: error instanceof Error ? error.message : "Attendance could not be updated." }));
    if (result.success) await utils.availability.coachSchedule.invalidate();
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
          <PrimaryButton title={t("openStaffWorkspace")} onPress={() => router.push("/availability")} />
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
        onPress={isCoach ? () => router.push("/availability") : undefined}
        icon="plus"
        buttonAccessibilityLabel={t("addAvailability")}
      />

      {isCoach ? <SurfaceCard style={styles.coachActionCard}>
        <View style={styles.coachActionCopy}>
          <Text style={[styles.coachActionTitle, { color: colors.foreground }]}>{t("availabilityWorkspace")}</Text>
          <Text style={[styles.coachActionText, { color: colors.muted }]}>{t("manageCoachTime")}</Text>
        </View>
        <Pressable onPress={() => router.push("/availability")} style={({ pressed }) => [styles.coachActionButton, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.coachActionButtonText}>{t("addAvailability")}</Text>
        </Pressable>
      </SurfaceCard> : null}

      {isCoach ? <>
        {(roomScheduleQuery.data?.rooms.length ?? 0) > 4 ? <View style={styles.roomFilterSection}>
          <Text style={[styles.roomFilterLabel, { color: colors.muted }]}>{t("filterRooms")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roomFilterRail}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: roomFilterId === "all" }} onPress={() => setRoomFilterId("all")} style={({ pressed }) => [styles.roomFilterChip, { borderColor: roomFilterId === "all" ? "#f04488" : colors.border, backgroundColor: roomFilterId === "all" ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><Text style={[styles.roomFilterChipText, { color: roomFilterId === "all" ? "#ff82b7" : colors.foreground }]}>{t("allRooms")}</Text></Pressable>
            {(roomScheduleQuery.data?.rooms ?? []).map((room) => <Pressable key={room.id} accessibilityRole="button" accessibilityState={{ selected: roomFilterId === room.id }} onPress={() => setRoomFilterId(room.id)} style={({ pressed }) => [styles.roomFilterChip, { borderColor: roomFilterId === room.id ? "#f04488" : colors.border, backgroundColor: roomFilterId === room.id ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><Text style={[styles.roomFilterChipText, { color: roomFilterId === room.id ? "#ff82b7" : colors.foreground }]}>{room.name}</Text></Pressable>)}
          </ScrollView>
        </View> : null}
        <CoachRoomCalendar
          month={visibleMonth}
          selectedDate={localDayKey(selectedDate)}
          rows={roomCalendarQuery.data ?? []}
          loading={roomCalendarQuery.isLoading}
          language={language}
          t={t}
          colors={colors}
          roomFilterId={roomFilterId}
          onMonthChange={setVisibleMonth}
          onDateChange={(date) => setSelectedDate(startOfLocalDay(new Date(`${date}T00:00:00`)))}
        />
        <CoachRoomSchedule
          date={localDayKey(selectedDate)}
          rooms={roomFilterId === "all" ? (roomScheduleQuery.data?.rooms ?? []) : (roomScheduleQuery.data?.rooms ?? []).filter((room) => room.id === roomFilterId)}
          loading={roomScheduleQuery.isLoading}
          language={language}
          t={t}
          colors={colors}
        />
      </> : null}

      {!isCoach ? <SurfaceCard style={styles.calendarCard}>
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
      </SurfaceCard> : null}

      <View style={styles.daySummaryHeader}>
        <View><Text style={[styles.summaryEyebrow, { color: "#a98af0" }]}>{t("selectedDay")}</Text><Text style={[styles.summaryTitle, { color: colors.foreground }]}>{selectedTitle}</Text></View>
        <Text style={[styles.summaryCount, { color: "#ff82b7" }]}>{selectedBookings.length} {selectedBookings.length === 1 ? t("session") : t("sessions")}</Text>
      </View>

      {selectedBookings.length === 0 ? <SurfaceCard style={styles.emptyCard}>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("nothingBooked")}</Text>
        <Text style={[styles.emptyMessage, { color: colors.muted }]}>{isCoach ? t("scheduleAppears") : t("chooseDayOrBook")}</Text>
        <PrimaryButton title={isCoach ? t("addAvailability") : t("browseSessions")} onPress={() => router.push(isCoach ? "/availability" : "/book")} />
      </SurfaceCard> : selectedBookings.map((booking) => {
        const slot = getBookingSlot(activeSnapshot, booking);
        if (!slot) return null;
        const coach = getCoach(activeSnapshot, slot.coachId);
        const bookingDuration = booking.durationMinutes ?? Math.round((new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60_000);
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
            <View style={styles.clientRow}><Avatar initials={initials(clientName)} accent="#b7e4dd" size={36} /><View style={styles.clientCopy}><Text style={[styles.clientName, { color: colors.foreground }]}>{clientName}</Text><Text style={[styles.clientMeta, { color: colors.muted }]}>{t("session")}</Text></View></View>
            <View style={[styles.capacityPanel, { borderColor: colors.border, backgroundColor: colors.surface }]}><View><Text style={[styles.capacityValue, { color: colors.foreground }]}>{concurrent}</Text><Text style={[styles.capacityLabel, { color: colors.muted }]}>{t("concurrentBooked")}</Text></View><View style={styles.capacityRight}><Text style={[styles.capacityValue, { color: "#ff82b7" }]}>{remaining}</Text><Text style={[styles.capacityLabel, { color: colors.muted }]}>{t("remainingCapacity")}</Text></View></View>
            {booking.status === "Confirmed" ? <View style={styles.coachActions}><Pressable onPress={() => handleAttendance(booking.id, "Completed")} style={[styles.attendanceButton, { backgroundColor: `${colors.success}18` }]}><Text style={[styles.attendanceButtonText, { color: colors.success }]}>{t("markDone")}</Text></Pressable><Pressable onPress={() => handleAttendance(booking.id, "No-show")} style={[styles.attendanceButton, { backgroundColor: `${colors.error}14` }]}><Text style={[styles.attendanceButtonText, { color: colors.error }]}>{t("noShow")}</Text></Pressable></View> : null}
          </SurfaceCard>;
        }

        return <SurfaceCard key={booking.id} style={styles.bookingCard}>
          <View style={styles.bookingTop}><View><Text style={[styles.bookingTime, { color: colors.foreground }]}>{formatTimeLocalized(slot.start, language)} <Text style={[styles.bookingDuration, { color: colors.muted }]}>· {bookingDuration} {t("minutes")}</Text></Text><Text style={[styles.bookingDate, { color: "#ff82b7" }]}>{formatDateLocalized(slot.start, language, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</Text></View><StatusBadge label={booking.checkInTime ? t("checkedIn") : statusLabel(booking.status, t)} tone={booking.checkInTime ? "success" : "accent"} /></View>
          <View style={[styles.bookingRule, { backgroundColor: colors.border }]} />
          <View style={styles.bookingMain}>{coach ? <Avatar initials={coach.initials} accent={coach.accent} size={40} /> : <View style={styles.openIcon}><Text style={styles.openIconText}>⌁</Text></View>}<View style={styles.bookingCopy}><Text style={[styles.bookingService, { color: colors.foreground }]}>{coach ? t("session") : t("selfGuidedAccess")}</Text><Text style={[styles.bookingCoach, { color: colors.muted }]}>{coach?.fullName ?? t("selfGuidedAccess")}</Text><Text style={[styles.bookingLocation, { color: colors.muted }]}>{slot.room}</Text></View></View>
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

function CoachRoomCalendar({ month, selectedDate, rows, loading, language, t, colors, roomFilterId, onMonthChange, onDateChange }: { month: Date; selectedDate: string; rows: { date: string; markers: string[]; publishedCount: number; bookingCount: number }[]; loading: boolean; language: "en" | "vi"; t: (key: any) => string; colors: ReturnType<typeof useColors>; roomFilterId: number | "all"; onMonthChange: (month: Date) => void; onDateChange: (date: string) => void }) {
  const days = buildMonthGrid(month);
  const rowByDate = new Map(rows.map((row) => [row.date, row]));
  const markerLabel = (marker: string) => marker === "partially_closed" ? t("roomStatusPartiallyClosed") : marker === "closed" ? t("roomStatusClosed") : marker === "full" ? t("roomStatusFull") : marker === "inactive" ? t("roomStatusInactive") : marker === "availability_published" ? t("roomStatusAvailabilityPublished") : marker === "client_booking" ? t("roomStatusClientBooking") : t("roomStatusAvailable");
  const legendMarkers: RoomStatusMarker[] = ["available", "partially_closed", "closed", "full", "inactive"];

  return <SurfaceCard style={styles.roomCalendarCard}>
    <View style={styles.roomCalendarTitleRow}>
      <View>
        <Text style={[styles.roomCalendarEyebrow, { color: "#ff82b7" }]}>{t("monthView")}</Text>
        <Text style={[styles.roomCalendarMonth, { color: colors.foreground }]}>{formatDateLocalized(month, language, { month: "long", year: "numeric" })}</Text>
      </View>
      <View style={styles.roomCalendarNav}>
        <Pressable onPress={() => onMonthChange(addMonths(month, -1))} accessibilityRole="button" accessibilityLabel={t("previousMonth")} style={({ pressed }) => [styles.roomCalendarNavButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.roomCalendarNavText, { color: colors.foreground }]}>‹</Text></Pressable>
        <Pressable onPress={() => onMonthChange(startOfMonth(new Date()))} accessibilityRole="button" accessibilityLabel={t("today")} style={({ pressed }) => [styles.roomCalendarTodayButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.roomCalendarTodayText, { color: colors.foreground }]}>{t("today")}</Text></Pressable>
        <Pressable onPress={() => onMonthChange(addMonths(month, 1))} accessibilityRole="button" accessibilityLabel={t("nextMonth")} style={({ pressed }) => [styles.roomCalendarNavButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.roomCalendarNavText, { color: colors.foreground }]}>›</Text></Pressable>
      </View>
    </View>
    {loading ? <Text style={[styles.roomScheduleLoading, { color: colors.muted }]}>{t("loading")}</Text> : <>
      <View style={styles.roomCalendarWeekdays}>{days.slice(0, 7).map((day) => <Text key={day.toISOString()} style={[styles.roomCalendarWeekday, { color: colors.muted }]}>{formatDateLocalized(day, language, { weekday: "narrow" })}</Text>)}</View>
      <View style={styles.roomCalendarGrid}>{days.map((day) => {
        const date = localDayKey(day);
        const row = rowByDate.get(date);
        const selected = date === selectedDate;
        const inMonth = day.getMonth() === month.getMonth();
        const markers = visibleRoomCalendarMarkers(row?.markers ?? []).filter((marker) => marker !== "availability_published" && marker !== "client_booking");
        const visibleMarkers = markers.slice(0, 3);
        const overflow = markers.length - visibleMarkers.length;
        return <Pressable key={date} onPress={() => onDateChange(date)} accessibilityRole="button" accessibilityLabel={`${formatDateLocalized(day, language, { weekday: "long", month: "long", day: "numeric" })}. ${roomFilterId === "all" ? `${t("allRooms")}. ` : ""}${markers.map(markerLabel).join(", ") || t("roomStatusAvailable")}`} accessibilityState={{ selected }} style={({ pressed }) => [styles.roomCalendarDay, { borderColor: selected ? "#f04488" : colors.border, backgroundColor: selected ? "#2b1f2a" : colors.surface, opacity: inMonth ? 1 : 0.44 }, pressed && styles.pressed]}><Text style={[styles.roomCalendarDayNumber, { color: selected ? "#ff82b7" : colors.foreground }]}>{day.getDate()}</Text><View style={styles.roomCalendarDots}>{visibleMarkers.map((marker) => <View key={marker} style={[styles.roomCalendarDot, { backgroundColor: roomStatusPresentation(marker).color }]} />)}{overflow > 0 ? <Text style={[styles.roomCalendarOverflow, { color: colors.muted }]}>+{overflow}</Text> : null}</View></Pressable>;
      })}</View>
      <View accessibilityLabel={t("roomCalendarLegend")} style={styles.roomLegendWrap}>{legendMarkers.map((marker) => <View key={marker} style={styles.roomLegendItem}><View style={[styles.roomLegendDot, { backgroundColor: roomStatusPresentation(marker).color }]} /><Text style={[styles.roomLegendText, { color: colors.muted }]}>{markerLabel(marker)}</Text></View>)}</View>
    </>}
  </SurfaceCard>;
}

function CoachRoomSchedule({ date, rooms, loading, language, t, colors }: { date: string; rooms: any[]; loading: boolean; language: "en" | "vi"; t: (key: any) => string; colors: ReturnType<typeof useColors> }) {
  const status = (value: string) => value === "full" ? t("roomStatusFull") : value === "temporarily_closed" ? t("roomStatusClosed") : value === "inactive" ? t("roomStatusInactive") : value === "outside_hours" ? t("roomStatusOutsideHours") : t("roomStatusAvailable");
  return <View style={styles.roomSchedule}>
    <Text style={[styles.roomScheduleLabel, { color: colors.muted }]}>{`${t("roomScheduleToday").toUpperCase()} · ${formatDateLocalized(new Date(`${date}T00:00:00`), language, { weekday: "long", month: "long", day: "numeric" })}`}</Text>
    {loading ? <Text style={[styles.roomScheduleLoading, { color: colors.muted }]}>{t("loading")}</Text> : rooms.map((room) => {
      const marker: RoomStatusMarker = room.statusReason === "outside_hours" ? "temporarily_closed" : room.statusReason;
      const visual = roomStatusPresentation(marker);
      const context = room.statusReason === "temporarily_closed"
        ? (room.closureReason ?? `${t("nextAvailableTime")}: ${room.nextAvailableSlot ? formatTimeLocalized(String(room.nextAvailableSlot), language) : "—"}`)
        : room.statusReason === "full"
          ? `${room.occupancy}/${room.maximumCapacity} ${t("roomCapacityRemaining")}`
          : room.windows?.some((window: any) => window.status === "available")
            ? t("roomStatusAvailabilityPublished")
            : `${room.occupancy}/${room.maximumCapacity} ${t("roomCapacityRemaining")}`;
      return <SurfaceCard key={room.id} style={[styles.roomScheduleDetail, { borderColor: colors.border }]}><View style={styles.roomScheduleDetailTop}><View style={styles.roomScheduleCopy}><Text style={[styles.roomScheduleName, { color: colors.foreground }]}>{room.name}</Text><Text numberOfLines={1} style={[styles.roomScheduleMeta, { color: colors.muted }]}>{context}</Text></View><View style={[styles.roomStatusPill, { backgroundColor: visual.background }]}><View style={[styles.roomStatusPillDot, { backgroundColor: visual.color }]} /><Text style={[styles.roomStatusPillText, { color: visual.color }]}>{status(room.statusReason)}</Text></View></View></SurfaceCard>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 16 },
  staffRestricted: { paddingTop: 10, gap: 18 }, staffCard: { gap: 12, padding: 19 }, staffTitle: { fontSize: 20, fontWeight: "900" }, staffCopy: { fontSize: 13, lineHeight: 20 },
  coachActionCard: { padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }, coachActionCopy: { flex: 1, gap: 3 }, coachActionTitle: { fontSize: 15, fontWeight: "900" }, coachActionText: { fontSize: 11, lineHeight: 16 }, coachActionButton: { paddingHorizontal: 12, minHeight: 36, borderRadius: 12, justifyContent: "center", backgroundColor: "#f04488" }, coachActionButtonText: { color: "#ffffff", fontSize: 11, fontWeight: "900" },
  roomFilterSection: { gap: 7 }, roomFilterLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1 }, roomFilterRail: { gap: 8, paddingRight: 14 }, roomFilterChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }, roomFilterChipText: { fontSize: 11, fontWeight: "800" }, roomCalendarCard: { padding: 14, gap: 10 }, roomCalendarTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }, roomCalendarEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, roomCalendarMonth: { fontSize: 20, fontWeight: "900", marginTop: 2 }, roomCalendarNav: { flexDirection: "row", alignItems: "center", gap: 6 }, roomCalendarNavButton: { width: 36, height: 36, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center" }, roomCalendarNavText: { fontSize: 25, fontWeight: "700", marginTop: -3 }, roomCalendarTodayButton: { height: 36, borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" }, roomCalendarTodayText: { fontSize: 11, fontWeight: "900" }, roomCalendarWeekdays: { flexDirection: "row", marginTop: 2 }, roomCalendarWeekday: { width: "14.2857%", textAlign: "center", fontSize: 10, fontWeight: "800" }, roomCalendarGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 5 }, roomCalendarDay: { width: "14.2857%", minHeight: 52, borderWidth: 1, borderRadius: 9, paddingTop: 6, alignItems: "center" }, roomCalendarDayNumber: { fontSize: 13, fontWeight: "900" }, roomCalendarDots: { minHeight: 12, marginTop: 5, flexDirection: "row", alignItems: "center", gap: 3 }, roomCalendarDot: { width: 6, height: 6, borderRadius: 3 }, roomCalendarOverflow: { fontSize: 8, fontWeight: "900", marginLeft: 1 }, roomLegendWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12, borderTopWidth: 1, borderTopColor: "#303036", paddingTop: 11 }, roomLegendItem: { flexDirection: "row", alignItems: "center", gap: 5 }, roomLegendDot: { width: 7, height: 7, borderRadius: 3.5 }, roomLegendText: { fontSize: 10, fontWeight: "700" }, roomSchedule: { gap: 7 }, roomScheduleLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 2 }, roomScheduleLoading: { fontSize: 12 }, roomScheduleDetail: { padding: 13 }, roomScheduleDetailTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }, roomScheduleCopy: { flex: 1, gap: 3 }, roomScheduleName: { fontSize: 14, fontWeight: "900" }, roomScheduleMeta: { fontSize: 11, lineHeight: 15 }, roomStatusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10 }, roomStatusPillDot: { width: 6, height: 6, borderRadius: 3 }, roomStatusPillText: { fontSize: 10, fontWeight: "900" },
  calendarCard: { padding: 14, gap: 13 }, monthHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }, monthEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, monthTitle: { fontSize: 19, fontWeight: "800", marginTop: 3 }, monthActions: { flexDirection: "row", alignItems: "center", gap: 6 }, iconButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" }, iconButtonText: { fontSize: 28, lineHeight: 28, marginTop: -3 }, todayButton: { height: 34, borderRadius: 17, borderWidth: 1, paddingHorizontal: 11, justifyContent: "center" }, todayButtonText: { fontSize: 11, fontWeight: "800" },
  weekRow: { flexDirection: "row" }, weekDay: { width: "14.285%", textAlign: "center", fontSize: 9, fontWeight: "800" }, grid: { flexDirection: "row", flexWrap: "wrap" }, dayCell: { width: "14.285%", aspectRatio: 0.88, padding: 2 }, dayButton: { flex: 1, alignItems: "center", borderRadius: 10, paddingTop: 4 }, selectedDay: { backgroundColor: "#5b2141" }, selectedDayText: { color: "#ffffff", fontWeight: "900" }, dayNumber: { fontSize: 12, fontWeight: "800" }, dayBlocks: { width: "100%", gap: 2, paddingHorizontal: 2, marginTop: 3 }, miniBlock: { minHeight: 13, borderRadius: 3, paddingHorizontal: 2, justifyContent: "center" }, miniBlockText: { color: "#ffffff", fontSize: 6.5, fontWeight: "900", textAlign: "center" }, moreBlocks: { fontSize: 7, fontWeight: "900", textAlign: "center", marginTop: 1 }, bookingDot: { minWidth: 14, height: 14, paddingHorizontal: 3, borderRadius: 7, alignItems: "center", justifyContent: "center", marginTop: 3 }, bookingDotText: { fontSize: 8, color: "#ffffff", fontWeight: "900" }, dotSpacer: { height: 14, marginTop: 3 }, calendarHint: { borderTopWidth: 1, borderTopColor: "#303036", paddingTop: 11, fontSize: 10, fontWeight: "700", textAlign: "center" },
  daySummaryHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 4 }, summaryEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, summaryTitle: { fontSize: 20, fontWeight: "800", marginTop: 3 }, summaryCount: { fontSize: 12, fontWeight: "800", marginBottom: 2 },
  bookingCard: { padding: 17, gap: 15 }, coachBookingCard: { padding: 16, gap: 12 }, bookingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }, bookingTime: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 }, bookingDuration: { fontSize: 12, fontWeight: "600", letterSpacing: 0 }, bookingDate: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 4 }, bookingRule: { height: 1 }, bookingMain: { flexDirection: "row", alignItems: "center", gap: 11 }, bookingCopy: { flex: 1, gap: 3 }, bookingService: { fontSize: 15, fontWeight: "800" }, bookingCoach: { fontSize: 12 }, bookingLocation: { fontSize: 11, marginTop: 2 }, openIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#282130" }, openIconText: { color: "#bba4ff", fontSize: 20 }, actionRow: { flexDirection: "row", alignItems: "center", gap: 9 }, actionFill: { flex: 1 }, windowNote: { flex: 1, minHeight: 44, borderRadius: 14, justifyContent: "center", paddingHorizontal: 12, backgroundColor: "#151518" }, windowText: { fontSize: 11, fontWeight: "700", lineHeight: 16 }, cancelButton: { minHeight: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, justifyContent: "center" }, cancelText: { fontSize: 12, fontWeight: "800" },
  timeBlock: { borderRadius: 12, padding: 11, gap: 4 }, timeBlockTime: { color: "#f7f7f8", fontSize: 14, fontWeight: "900" }, timeBlockClient: { color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "700" }, clientRow: { flexDirection: "row", alignItems: "center", gap: 10 }, clientCopy: { flex: 1 }, clientName: { fontSize: 14, fontWeight: "900" }, clientMeta: { fontSize: 11, marginTop: 3 }, capacityPanel: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", justifyContent: "space-between" }, capacityRight: { alignItems: "flex-end" }, capacityValue: { fontSize: 20, fontWeight: "900" }, capacityLabel: { fontSize: 11, marginTop: 2 }, coachActions: { flexDirection: "row", gap: 8 }, attendanceButton: { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 }, attendanceButtonText: { fontSize: 11, fontWeight: "900" },
  sheetBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, backgroundColor: "rgba(4, 5, 7, 0.72)" }, backdropDismiss: { ...StyleSheet.absoluteFillObject }, confirmationSheet: { width: "100%", maxWidth: 340, borderRadius: 26, borderWidth: 1, paddingHorizontal: 22, paddingTop: 25, paddingBottom: 18, alignItems: "center", backgroundColor: "#1d1d21", shadowColor: "#000000", shadowOpacity: 0.42, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 12 }, confirmationIcon: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginBottom: 17 }, confirmationIconText: { fontSize: 29, lineHeight: 33, fontWeight: "800" }, confirmationTitle: { fontSize: 20, lineHeight: 25, fontWeight: "800", textAlign: "center", letterSpacing: -0.3 }, confirmationMessage: { marginTop: 8, fontSize: 14, lineHeight: 20, textAlign: "center" }, confirmationActions: { alignSelf: "stretch", gap: 10, marginTop: 23 }, confirmationSecondaryButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#26262b" }, confirmationSecondaryText: { fontSize: 15, fontWeight: "800" }, confirmationDestructiveButton: { minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#ffe9e7" }, confirmationDestructiveText: { color: "#6f1814", fontSize: 15, fontWeight: "800" }, confirmationButton: { alignSelf: "stretch", minHeight: 46, borderRadius: 14, marginTop: 23, alignItems: "center", justifyContent: "center" }, confirmationButtonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] }, confirmationButtonText: { fontSize: 15, fontWeight: "800" },
  emptyCard: { padding: 22, gap: 10, alignItems: "flex-start" }, emptyTitle: { fontSize: 18, fontWeight: "800" }, emptyMessage: { fontSize: 13, lineHeight: 19, marginBottom: 4 }, pressed: { opacity: 0.7 },
});
