import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { GhostButton, ScreenHeader, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useGym } from "@/lib/gym-store";
import { formatDateLabel, formatShortDate, getBookingSlot, getCoach, getService } from "@/shared/gym";

export default function HistoryScreen() {
  const colors = useColors();
  const { snapshot, historyBookings } = useGym();
  const [filter, setFilter] = useState<"all" | "Completed" | "Cancelled" | "No-show">("all");
  const filtered = useMemo(() => historyBookings.filter((booking) => filter === "all" || booking.status === filter), [filter, historyBookings]);
  const completedCount = historyBookings.filter((booking) => booking.status === "Completed").length;
  const checkInRate = historyBookings.length ? Math.round((completedCount / historyBookings.length) * 100) : 0;

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="History" subtitle="Your consistency, over time." />
        <SurfaceCard style={styles.summaryCard}><View><Text style={[styles.summaryEyebrow, { color: colors.primary }]}>ATTENDANCE SUMMARY</Text><Text style={[styles.summaryTitle, { color: colors.foreground }]}>You’re building a habit.</Text></View><View style={styles.summaryStats}><View style={styles.summaryStat}><Text style={[styles.summaryValue, { color: colors.foreground }]}>{completedCount}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>Completed</Text></View><View style={styles.summaryStat}><Text style={[styles.summaryValue, { color: colors.primary }]}>{checkInRate}%</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>Attendance</Text></View><View style={styles.summaryStat}><Text style={[styles.summaryValue, { color: colors.foreground }]}>2</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>Week streak</Text></View></View></SurfaceCard>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}><HistoryFilter label="All activity" active={filter === "all"} onPress={() => setFilter("all")} /><HistoryFilter label="Completed" active={filter === "Completed"} onPress={() => setFilter("Completed")} /><HistoryFilter label="Cancelled" active={filter === "Cancelled"} onPress={() => setFilter("Cancelled")} /><HistoryFilter label="No-show" active={filter === "No-show"} onPress={() => setFilter("No-show")} /></ScrollView>

        <View style={styles.list}>{filtered.length === 0 ? <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No activity here yet</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Your completed and cancelled sessions will show up as you use GymFlow.</Text></SurfaceCard> : filtered.map((booking) => {
          const slot = getBookingSlot(snapshot, booking);
          if (!slot) return null;
          const service = getService(snapshot, slot.serviceTypeId);
          const coach = getCoach(snapshot, slot.coachId);
          const tone = booking.status === "Completed" ? "success" : booking.status === "Cancelled" ? "neutral" : "error";
          return <SurfaceCard key={booking.id} style={styles.historyCard}><View style={styles.historyTop}><View><Text style={[styles.historyDate, { color: colors.foreground }]}>{formatShortDate(slot.start)}</Text><Text style={[styles.historyTime, { color: colors.muted }]}>{formatDateLabel(slot.start)} · {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(slot.start))}</Text></View><StatusBadge label={booking.status} tone={tone as "success" | "neutral" | "error"} /></View><View style={[styles.historyRule, { backgroundColor: colors.border }]} /><Text style={[styles.historyService, { color: colors.foreground }]}>{service?.name}</Text><Text style={[styles.historyMeta, { color: colors.muted }]}>{coach?.fullName ?? "Open Gym"} · {slot.room}</Text>{booking.checkInTime ? <Text style={[styles.checkInText, { color: colors.success }]}>Checked in at {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(booking.checkInTime))}</Text> : booking.cancellationReason ? <Text style={[styles.checkInText, { color: colors.muted }]}>Reason: {booking.cancellationReason}</Text> : null}</SurfaceCard>;
        })}</View>
        <GhostButton title="Export attendance" onPress={() => undefined} icon="arrow.right" />
      </ScrollView>
    </ScreenContainer>
  );
}

function HistoryFilter({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return <Text onPress={onPress} style={[styles.filter, { color: active ? colors.primary : colors.muted, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}12` : colors.surface }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 18 },
  summaryCard: { gap: 18 },
  summaryEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  summaryTitle: { fontSize: 20, fontWeight: "800", marginTop: 5, letterSpacing: -0.3 },
  summaryStats: { flexDirection: "row", justifyContent: "space-between" },
  summaryStat: { gap: 3 },
  summaryValue: { fontSize: 25, fontWeight: "800" },
  summaryLabel: { fontSize: 11, fontWeight: "700" },
  filters: { gap: 8, paddingRight: 18 },
  filter: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9, fontSize: 12, fontWeight: "800", overflow: "hidden" },
  list: { gap: 11 },
  historyCard: { gap: 10 },
  historyTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  historyDate: { fontSize: 15, fontWeight: "800" },
  historyTime: { fontSize: 12, marginTop: 3 },
  historyRule: { height: 1, marginVertical: 2 },
  historyService: { fontSize: 14, fontWeight: "800" },
  historyMeta: { fontSize: 12 },
  checkInText: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  emptyCard: { padding: 22, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "800" },
  emptyText: { fontSize: 13, lineHeight: 19 },
});
