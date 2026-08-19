import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { GhostButton, ScreenHeader, SpectrumCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useLanguage } from "@/lib/language-provider";
import { formatDateLocalized, formatTimeLocalized } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

export default function HistoryScreen() {
  const colors = useColors();
  const { language, t } = useLanguage();
  const schedule = trpc.member.schedule.useQuery();
  const [filter, setFilter] = useState<"all" | "completed" | "cancelled" | "no_show">("all");
  const [section, setSection] = useState<"upcoming" | "past" | "progress">("upcoming");
  const historyBookings = useMemo(() => (schedule.data ?? []).filter((booking) => ["completed", "cancelled", "no_show"].includes(booking.status) || new Date(booking.endAt) <= new Date()), [schedule.data]);
  const filtered = useMemo(() => historyBookings.filter((booking) => filter === "all" || booking.status === filter), [filter, historyBookings]);
  const completedCount = historyBookings.filter((booking) => booking.status === "completed").length;
  const eligibleCount = historyBookings.filter((booking) => booking.status !== "cancelled").length;
  const checkInRate = eligibleCount ? Math.round((completedCount / eligibleCount) * 100) : 0;

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title={t("historyTitle")} subtitle={t("historySubtitle")} label={t("yourProgress")} />
        <View style={[styles.segmentedControl, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(["upcoming", "past", "progress"] as const).map((item) => (
            <Pressable key={item} onPress={() => setSection(item)} accessibilityRole="button" accessibilityState={{ selected: section === item }} style={({ pressed }) => [styles.segmentButton, section === item && styles.segmentActive, pressed && styles.pressed]}>
              <Text style={[styles.segmentText, { color: section === item ? "#ffffff" : colors.muted }]}>{item === "upcoming" ? t("upcomingSchedule") : item === "past" ? t("history") : t("progress")}</Text>
            </Pressable>
          ))}
        </View>
        {section === "upcoming" ? (
          <SurfaceCard style={styles.emptyCard}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("upcomingSchedule")}</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>{t("upcomingSessionsAndUpdates")}</Text>
            <GhostButton title={t("schedule")} onPress={() => router.push("/schedule")} icon="calendar" />
          </SurfaceCard>
        ) : null}
        {section === "progress" ? (
          <Pressable onPress={() => router.push("/progress")} accessibilityRole="button" style={({ pressed }) => [styles.healthEntry, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}>
            <View>
              <Text style={styles.healthEyebrow}>{t("healthProgressCard")}</Text>
              <Text style={[styles.healthTitle, { color: colors.foreground }]}>{t("measurementsAndTrends")}</Text>
              <Text style={[styles.healthCopy, { color: colors.muted }]}>{t("compareMeasurements")}</Text>
            </View>
            <Text style={styles.healthArrow}>→</Text>
          </Pressable>
        ) : null}
        {section === "past" ? (
          <>
            <SpectrumCard style={styles.summaryCard} intensity="muted">
              <Text style={styles.summaryEyebrow}>{t("attendanceSummary")}</Text>
              <Text style={styles.summaryTitle}>{t("keepMomentum")}</Text>
              <View style={styles.summaryStats}>
                <SummaryMetric value={String(completedCount)} label={t("completed")} />
                <SummaryMetric value={`${checkInRate}%`} label={t("attendance")} />
                <SummaryMetric value={String(Math.max(0, completedCount))} label={t("checkIns")} />
              </View>
            </SpectrumCard>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              <HistoryFilter label={t("allActivity")} active={filter === "all"} onPress={() => setFilter("all")} />
              <HistoryFilter label={t("completed")} active={filter === "completed"} onPress={() => setFilter("completed")} />
              <HistoryFilter label={t("cancelled")} active={filter === "cancelled"} onPress={() => setFilter("cancelled")} />
              <HistoryFilter label={t("noShow")} active={filter === "no_show"} onPress={() => setFilter("no_show")} />
            </ScrollView>
            {schedule.isLoading ? (
              <ActivityIndicator color="#ff82b7" />
            ) : schedule.isError ? (
              <SurfaceCard style={styles.emptyCard}>
                <Text style={[styles.emptyTitle, { color: colors.error }]}>{t("scheduleUnavailable")}</Text>
                <Text style={[styles.emptyText, { color: colors.muted }]}>{schedule.error.message}</Text>
              </SurfaceCard>
            ) : (
              <View style={styles.list}>
                {filtered.length === 0 ? (
                  <SurfaceCard style={styles.emptyCard}>
                    <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noActivityYet")}</Text>
                    <Text style={[styles.emptyText, { color: colors.muted }]}>{t("historyEmpty")}</Text>
                  </SurfaceCard>
                ) : (
                  filtered.map((booking) => {
                    const tone = booking.status === "completed" ? "success" : booking.status === "cancelled" ? "neutral" : "error";
                    return (
                      <SurfaceCard key={booking.id} style={styles.historyCard}>
                        <View style={styles.historyTop}>
                          <View>
                            <Text style={[styles.historyDate, { color: colors.foreground }]}>
                              {formatDateLocalized(booking.startAt, language, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </Text>
                            <Text style={[styles.historyTime, { color: colors.muted }]}>
                              {formatDateLocalized(booking.startAt, language, {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              · {formatTimeLocalized(booking.startAt, language)}
                            </Text>
                          </View>
                          <StatusBadge label={statusLabel(booking.status, t)} tone={tone} />
                        </View>
                        <View style={[styles.historyRule, { backgroundColor: colors.border }]} />
                        <Text style={[styles.historyService, { color: colors.foreground }]}>{booking.coachName ? t("session") : t("openGym")}</Text>
                        <Text style={[styles.historyMeta, { color: colors.muted }]}>
                          {booking.coachName ?? t("openGym")} · {booking.room}
                        </Text>
                        {booking.checkInTime ? (
                          <Text style={[styles.checkInText, { color: colors.success }]}>
                            {t("checkedInAt")} {formatTimeLocalized(booking.checkInTime, language)}
                          </Text>
                        ) : booking.cancellationReason ? (
                          <Text style={[styles.checkInText, { color: colors.muted }]}>
                            {t("reason")}: {booking.cancellationReason}
                          </Text>
                        ) : null}
                      </SurfaceCard>
                    );
                  })
                )}
              </View>
            )}
            <GhostButton title={t("exportAttendance")} onPress={() => undefined} icon="arrow.right" />
          </>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function SummaryMetric({ value, label }: { value: string; label: string }) {
  return (
    <View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function statusLabel(status: string, t: (key: any) => string) {
  if (status === "completed") return t("completed");
  if (status === "cancelled") return t("cancelled");
  if (status === "no_show") return t("noShow");
  return status;
}

function HistoryFilter({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filter,
        {
          borderColor: active ? "#f04488" : colors.border,
          backgroundColor: active ? "#2b1f2a" : colors.surface,
        },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
    >
      <Text
        style={{
          color: active ? "#ff82b7" : colors.muted,
          fontSize: 12,
          fontWeight: "800",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 18 },
  summaryCard: { minHeight: 170 },
  summaryEyebrow: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  summaryTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.45,
    marginTop: 6,
  },
  summaryStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 22,
  },
  summaryValue: { color: "#ffffff", fontSize: 25, fontWeight: "800" },
  summaryLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  healthEntry: {
    minHeight: 98,
    borderWidth: 1,
    borderRadius: 20,
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  healthEyebrow: {
    color: "#ff82b7",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  healthTitle: { fontSize: 16, fontWeight: "800", marginTop: 4 },
  healthCopy: { fontSize: 12, marginTop: 4 },
  healthArrow: { color: "#ff82b7", fontSize: 24, fontWeight: "700" },
  segmentedControl: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  segmentActive: { backgroundColor: "#f04488" },
  segmentText: { fontSize: 11, fontWeight: "800" },
  filters: { gap: 8, paddingRight: 18 },
  filter: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  list: { gap: 11 },
  historyCard: { gap: 10 },
  historyTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  historyDate: { fontSize: 15, fontWeight: "800" },
  historyTime: { fontSize: 12, marginTop: 3 },
  historyRule: { height: 1, marginVertical: 2 },
  historyService: { fontSize: 14, fontWeight: "800" },
  historyMeta: { fontSize: 12 },
  checkInText: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  emptyCard: { padding: 22, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "800" },
  emptyText: { fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72 },
});
