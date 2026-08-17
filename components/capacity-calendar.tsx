import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { getRoleAccent, type CoachoraRole } from "@/components/gym-ui";
import { useColors } from "@/hooks/use-colors";
import { addMonths, buildMonthGrid, isSameLocalDay, localDayKey, startOfMonth } from "@/lib/calendar";

const RING_RADIUS = 16;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export type CapacityCalendarDay = {
  /** A local date key in YYYY-MM-DD form. */
  date: string;
  /** `null` means this date has no bookable capacity. */
  capacity: number | null;
  /** Number booked against capacity. Values are capped to capacity for rendering. */
  booked: number;
  /** Authoritative utilization percentage when the role aggregates multiple rooms. */
  utilization?: number | null;
  /** The signed-in Client has a booking on this day. */
  bookedByViewer?: boolean;
  /** Short semantic summary used by assistive technologies and downstream selected-day panels. */
  summary?: string;
};

export type CapacityCalendarProps = {
  role: CoachoraRole;
  month: Date;
  selectedDate: string;
  days: CapacityCalendarDay[];
  locale: string;
  title: string;
  loading?: boolean;
  onMonthChange: (month: Date) => void;
  onDateChange: (date: string) => void;
  onInfoPress?: () => void;
  todayLabel: string;
  previousLabel: string;
  nextLabel: string;
  infoLabel?: string;
  loadingLabel?: string;
};

function ratioFor(day?: CapacityCalendarDay) {
  if (typeof day?.utilization === "number") return Math.min(1, Math.max(0, day.utilization));
  if (!day || day.capacity === null || day.capacity <= 0) return 0;
  return Math.min(1, Math.max(0, day.booked / day.capacity));
}

function CapacityRing({ ratio, accent, selected, full }: { ratio: number; accent: string; selected: boolean; full: boolean }) {
  if (selected || ratio === 0 || full) return null;
  const dashOffset = RING_CIRCUMFERENCE * (1 - ratio);
  return <Svg width={42} height={42} viewBox="0 0 42 42" style={styles.ring} pointerEvents="none">
    <Circle cx="21" cy="21" r={RING_RADIUS} fill="none" stroke={`${accent}26`} strokeWidth="2" />
    <Circle cx="21" cy="21" r={RING_RADIUS} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`} strokeDashoffset={dashOffset} rotation="-90" origin="21,21" />
  </Svg>;
}

function SelectedFill() {
  return <View pointerEvents="none" style={styles.selectedFill}><View style={styles.selectedCoral} /><View style={styles.selectedPurple} /><View style={styles.selectedAmber} /></View>;
}

/**
 * The single calendar visual signature for Coach, Admin, and Client roles.
 * Data semantics are intentionally supplied by each role; rendering, capacity state,
 * selection, today outline, and accessibility labels remain identical.
 */
export function CapacityCalendar({ role, month, selectedDate, days, locale, title, loading = false, onMonthChange, onDateChange, onInfoPress, todayLabel, previousLabel, nextLabel, infoLabel = "Calendar information", loadingLabel = "Loading calendar" }: CapacityCalendarProps) {
  const colors = useColors();
  const accent = getRoleAccent(role);
  const grid = buildMonthGrid(month);
  const dayByKey = new Map(days.map((day) => [day.date, day]));
  const weekdays = grid.slice(0, 7).map((day) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(day));
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
  const today = new Date();

  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.header}>
      <View><Text style={[styles.eyebrow, { color: accent }]}>{title}</Text><Text style={[styles.month, { color: colors.foreground }]}>{monthLabel}</Text></View>
      <View style={styles.headerActions}>
        {onInfoPress ? <Pressable accessibilityRole="button" accessibilityLabel={infoLabel} onPress={onInfoPress} style={({ pressed }) => [styles.infoButton, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.infoText, { color: colors.foreground }]}>?</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={previousLabel} onPress={() => onMonthChange(addMonths(month, -1))} style={({ pressed }) => [styles.navButton, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.navText, { color: colors.foreground }]}>‹</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={todayLabel} onPress={() => onMonthChange(startOfMonth(today))} style={({ pressed }) => [styles.todayButton, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.todayText, { color: colors.foreground }]}>{todayLabel}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={nextLabel} onPress={() => onMonthChange(addMonths(month, 1))} style={({ pressed }) => [styles.navButton, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.navText, { color: colors.foreground }]}>›</Text></Pressable>
      </View>
    </View>

    {loading ? <Text style={[styles.loading, { color: colors.muted }]}>{loadingLabel}</Text> : <>
      <View style={styles.weekdays}>{weekdays.map((weekday, index) => <Text key={`${weekday}-${index}`} style={[styles.weekday, { color: colors.muted }]}>{weekday}</Text>)}</View>
      <View style={styles.grid}>{grid.map((date) => {
        const key = localDayKey(date);
        const day = dayByKey.get(key);
        const selected = key === selectedDate;
        const isToday = isSameLocalDay(date, today);
        const inMonth = date.getMonth() === month.getMonth();
        const ratio = ratioFor(day);
        const full = day?.capacity !== null && ratio >= 1;
        const open = day?.capacity !== null && ratio === 0;
        const accessibleState = day?.capacity === null ? "No availability" : full ? "Fully booked" : ratio > 0 ? `${Math.round(ratio * 100)}% booked` : "Open";
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" }).format(date)}. ${day?.summary ?? accessibleState}`} onPress={() => onDateChange(key)} style={({ pressed }) => [styles.day, inMonth ? null : styles.outsideMonth, isToday && !selected ? [styles.todayOutline, { borderColor: colors.foreground }] : null, full && !selected ? { backgroundColor: accent } : null, pressed && styles.pressed]}>
          {selected ? <SelectedFill /> : null}
          {open ? <View pointerEvents="none" style={[styles.openRing, { borderColor: accent }]} /> : null}
          <CapacityRing ratio={ratio} accent={accent} selected={selected} full={full} />
          <Text style={[styles.dayNumber, { color: selected || full ? "#0B0B0F" : inMonth ? colors.foreground : colors.tertiary }]}>{date.getDate()}</Text>
          {day?.bookedByViewer ? <View pointerEvents="none" style={styles.viewerBookingDot} /> : null}
        </Pressable>;
      })}</View>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  eyebrow: { fontSize: 10, lineHeight: 16, letterSpacing: 0.9, fontWeight: "800", textTransform: "uppercase" },
  month: { fontSize: 22, lineHeight: 28, letterSpacing: -0.35, fontWeight: "700", marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 5 },
  infoButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  infoText: { fontSize: 14, fontWeight: "800" },
  navButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 27, lineHeight: 28, marginTop: -3 },
  todayButton: { height: 34, paddingHorizontal: 10, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  todayText: { fontSize: 11, lineHeight: 14, fontWeight: "800" },
  loading: { paddingVertical: 28, textAlign: "center", fontSize: 13 },
  weekdays: { flexDirection: "row" }, weekday: { width: "14.2857%", textAlign: "center", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 8 },
  day: { width: "14.2857%", aspectRatio: 1, maxHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "transparent", overflow: "hidden", position: "relative" },
  outsideMonth: { opacity: 0.36 }, todayOutline: { borderWidth: 1.5 },
  selectedFill: { ...StyleSheet.absoluteFillObject, flexDirection: "row" }, selectedCoral: { flex: 1, backgroundColor: "#FF6B7A" }, selectedPurple: { flex: 1, backgroundColor: "#C65FE0" }, selectedAmber: { flex: 1, backgroundColor: "#FFB86B" },
  openRing: { position: "absolute", width: 36, height: 36, borderRadius: 18, borderWidth: 1.5 }, ring: { position: "absolute", width: 42, height: 42 },
  dayNumber: { fontSize: 15, lineHeight: 20, fontWeight: "700", fontVariant: ["tabular-nums"] }, viewerBookingDot: { position: "absolute", width: 5, height: 5, borderRadius: 2.5, bottom: 6, backgroundColor: "#60A5FA" }, pressed: { opacity: 0.7 },
});
