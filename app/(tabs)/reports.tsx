import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenHeader, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { startOfLocalDay } from "@/lib/calendar";
import { formatDateLocalized, formatTimeLocalized } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-provider";
import { trpc } from "@/lib/trpc";

type Period = "day" | "week";

export default function ReportsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const role = user?.role;
  const [period, setPeriod] = useState<Period>("day");
  const [roomId, setRoomId] = useState<number | null>(null);
  const [coachName, setCoachName] = useState<string>("all");
  const roomsQuery = trpc.admin.listRooms.useQuery(undefined, { enabled: role === "admin" });
  const start = useMemo(() => startOfLocalDay(new Date()), []);
  const end = useMemo(() => new Date(start.getTime() + (period === "week" ? 7 : 1) * 86_400_000), [period, start]);
  const scheduleQuery = trpc.admin.roomSchedule.useQuery({ roomId: roomId ?? 0, from: start.toISOString(), to: end.toISOString() }, { enabled: role === "admin" && Boolean(roomId) });
  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);

  useEffect(() => { if (!roomId && rooms[0]) setRoomId(rooms[0].id); }, [roomId, rooms]);

  const coaches = useMemo(() => Array.from(new Set((scheduleQuery.data?.windows ?? []).map((window) => window.coachName).filter(Boolean))) as string[], [scheduleQuery.data?.windows]);
  const rows = useMemo(() => (scheduleQuery.data?.windows ?? []).filter((window) => coachName === "all" || window.coachName === coachName), [coachName, scheduleQuery.data?.windows]);

  if (role !== "admin") return null;

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Reports" subtitle="Review existing room and booking activity" label="ADMIN" />
      <View style={styles.filterRow}>{(["day", "week"] as const).map((value) => <FilterChip key={value} label={value === "day" ? "Day" : "Week"} selected={period === value} onPress={() => setPeriod(value)} colors={colors} />)}</View>
      <Text style={[styles.filterLabel, { color: colors.muted }]}>ROOM</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{rooms.map((room) => <FilterChip key={room.id} label={room.name} selected={room.id === roomId} onPress={() => setRoomId(room.id)} colors={colors} />)}</ScrollView>
      {coaches.length > 1 ? <><Text style={[styles.filterLabel, { color: colors.muted }]}>COACH</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}><FilterChip label="All coaches" selected={coachName === "all"} onPress={() => setCoachName("all")} colors={colors} />{coaches.map((coach) => <FilterChip key={coach} label={coach} selected={coachName === coach} onPress={() => setCoachName(coach)} colors={colors} />)}</ScrollView></> : null}
      <SurfaceCard style={styles.summary}><Text style={[styles.summaryValue, { color: colors.foreground }]}>{rows.length}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>{period === "day" ? "availability windows today" : "availability windows this week"}</Text></SurfaceCard>
      {roomsQuery.isLoading || scheduleQuery.isLoading ? <ActivityIndicator color="#ff82b7" /> : <View style={styles.list}>{rows.length ? rows.map((window) => <SurfaceCard key={window.id} style={styles.row}><View style={styles.rowTop}><View><Text style={[styles.rowTime, { color: colors.foreground }]}>{formatDateLocalized(window.startAt, language, { weekday: "short", month: "short", day: "numeric" })} · {formatTimeLocalized(window.startAt, language)}–{formatTimeLocalized(window.endAt, language)}</Text><Text style={[styles.rowMeta, { color: colors.muted }]}>{window.coachName} · {window.location}</Text></View><StatusBadge label={window.status.toLowerCase() === "available" ? t("available") : window.status} tone={window.status.toLowerCase() === "available" ? "success" : "warning"} /></View></SurfaceCard>) : <SurfaceCard style={styles.empty}><Text style={[styles.emptyText, { color: colors.muted }]}>No activity matches these filters.</Text></SurfaceCard>}</View>}
    </ScrollView>
  </ScreenContainer>;
}

function FilterChip({ label, selected, onPress, colors }: { label: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={({ pressed }) => [styles.chip, { borderColor: selected ? "#f04488" : colors.border, backgroundColor: selected ? "#2b1f2a" : colors.surface }, pressed && styles.pressed]}><Text numberOfLines={1} style={[styles.chipText, { color: selected ? "#ff82b7" : colors.foreground }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 14 }, filterLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 2 }, filterRow: { flexDirection: "row", gap: 8, paddingRight: 12 }, chip: { minHeight: 36, maxWidth: 180, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, justifyContent: "center" }, chipText: { fontSize: 11, fontWeight: "800" }, summary: { gap: 3 }, summaryValue: { fontSize: 28, fontWeight: "900" }, summaryLabel: { fontSize: 12 }, list: { gap: 9 }, row: { padding: 13 }, rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }, rowTime: { fontSize: 13, fontWeight: "800" }, rowMeta: { fontSize: 11, marginTop: 4 }, empty: { padding: 18 }, emptyText: { fontSize: 12 }, pressed: { opacity: 0.72 },
});
