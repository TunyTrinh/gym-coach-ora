import { router } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { Avatar, PrimaryButton, SpectrumCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { intervalsOverlap } from "@/lib/availability-shifts";
import { formatDateLocalized, formatTimeLocalized } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-provider";
import { trpc } from "@/lib/trpc";

function initials(name: string) { return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "C"; }
function timeTone(date: Date) { const hour = date.getHours(); return hour < 11 ? "morning" : hour < 15 ? "midday" : "afternoon"; }

export default function CoachScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const schedule = trpc.availability.coachSchedule.useQuery(undefined, { enabled: user?.role === "coach" || user?.role === "admin" });
  const markAttendance = trpc.availability.markAttendance.useMutation();
  const utils = trpc.useUtils();
  const sessions = (schedule.data ?? [])
    .filter((row) => new Date(row.endAt) > new Date() && row.status !== "cancelled")
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const roleLabel = user?.role === "admin" ? t("admin") : t("coachLabel");

  const updateAttendance = async (bookingId: string, status: "completed" | "no_show") => {
    try {
      await markAttendance.mutateAsync({ bookingId, status });
      await utils.availability.coachSchedule.invalidate();
      Alert.alert(t("attendanceSaved"), status === "completed" ? "Member marked completed." : "Member marked no-show.");
    } catch (error) {
      Alert.alert(t("couldNotUpdateShift"), error instanceof Error ? error.message : t("couldNotUpdateShift"));
    }
  };

  if (user?.role !== "coach" && user?.role !== "admin") {
    return <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}><View style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("restricted")}</Text><Text style={[styles.emptyText, { color: colors.muted }]}>{t("coachAccessRequired")}</Text><PrimaryButton title={t("back")} onPress={() => router.back()} /></View></ScreenContainer>;
  }

  return <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><View style={styles.header}><Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityRole="button"><IconSymbol name="chevron.left" size={20} color={colors.foreground} /></Pressable><View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: colors.primary }]}>{roleLabel}</Text><Text style={[styles.title, { color: colors.foreground }]}>{t("coachSchedule")}</Text></View><StatusBadge label={t("live")} tone="success" /></View><SpectrumCard style={styles.summaryCard} intensity="muted"><Text style={styles.summaryEyebrow}>{t("todayFocus")}</Text><View style={styles.summaryRow}><View><Text style={styles.summaryValue}>{sessions.length}</Text><Text style={styles.summaryLabel}>{t("upcomingSessions")}</Text></View><View style={styles.summaryIcon}><IconSymbol name="figure.strengthtraining.traditional" size={25} color="#ffffff" /></View></View></SpectrumCard><View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t("coachSchedule")}</Text><Text style={[styles.sectionMeta, { color: colors.muted }]}>{t("scheduleNextDays")}</Text></View><View style={styles.list}>{schedule.isError ? <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.error }]}>{t("couldNotUpdateShift")}</Text><Text style={[styles.emptyText, { color: colors.muted }]}>{schedule.error.message}</Text></SurfaceCard> : sessions.length ? sessions.map((session) => {
    const startsAt = new Date(session.startAt);
    const duration = Math.round((new Date(session.endAt).getTime() - startsAt.getTime()) / 60_000);
    const tone = timeTone(startsAt);
    const toneStyle = tone === "morning" ? styles.morning : tone === "midday" ? styles.midday : styles.afternoon;
    const statusTone = session.status === "confirmed" ? "success" : session.status === "pending" ? "warning" : "neutral";
    const clientName = session.clientName ?? `Client ${session.clientId}`;
    const concurrent = sessions.filter((other) => other.availabilityId === session.availabilityId && ["confirmed", "pending"].includes(other.status) && intervalsOverlap(new Date(session.startAt).toISOString(), new Date(session.endAt).toISOString(), new Date(other.startAt).toISOString(), new Date(other.endAt).toISOString())).length;
    const remaining = Math.max(0, session.availabilityCapacity - concurrent);
    return <SurfaceCard key={session.id} style={styles.sessionCard}><View style={styles.sessionTop}><View><Text style={[styles.sessionDate, { color: colors.primary }]}>{formatDateLocalized(session.startAt, language, { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</Text><Text style={[styles.sessionTime, { color: colors.foreground }]}>{formatTimeLocalized(session.startAt, language)}–{formatTimeLocalized(session.endAt, language)}</Text></View><StatusBadge label={session.status} tone={statusTone} /></View><View style={[styles.timeBlock, toneStyle]}><Text style={styles.timeBlockTime}>{formatTimeLocalized(session.startAt, language)}–{formatTimeLocalized(session.endAt, language)}</Text><Text style={styles.timeBlockClient}>{clientName}</Text></View><View style={styles.clientRow}><Avatar initials={initials(clientName)} accent="#b7e4dd" size={34} /><View style={styles.clientCopy}><Text style={[styles.clientName, { color: colors.foreground }]}>{clientName}</Text><Text style={[styles.clientMeta, { color: colors.muted }]}>{duration} {t("minutes")} · {session.room}</Text></View></View><View style={[styles.capacityPanel, { borderColor: colors.border, backgroundColor: colors.surface }]}><View><Text style={[styles.capacityValue, { color: colors.foreground }]}>{concurrent}</Text><Text style={[styles.capacityLabel, { color: colors.muted }]}>{t("concurrentBooked")}</Text></View><View style={styles.capacityRight}><Text style={[styles.capacityValue, { color: "#ff82b7" }]}>{remaining}</Text><Text style={[styles.capacityLabel, { color: colors.muted }]}>{t("remainingCapacity")}</Text></View></View>{session.status === "confirmed" ? <View style={styles.actions}><Pressable onPress={() => void updateAttendance(session.id, "completed")} style={[styles.attendanceButton, { backgroundColor: `${colors.success}18` }]}><Text style={[styles.attendanceButtonText, { color: colors.success }]}>{t("markDone")}</Text></Pressable><Pressable onPress={() => void updateAttendance(session.id, "no_show")} style={[styles.attendanceButton, { backgroundColor: `${colors.error}14` }]}><Text style={[styles.attendanceButtonText, { color: colors.error }]}>{t("noShow")}</Text></Pressable></View> : null}</SurfaceCard>;
  }) : <SurfaceCard style={styles.emptyCard}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noUpcomingSessions")}</Text><Text style={[styles.emptyText, { color: colors.muted }]}>{t("scheduleAppears")}</Text><PrimaryButton title={t("addAvailability")} onPress={() => router.replace("/availability")} /></SurfaceCard>}</View></ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { paddingTop: 10, paddingBottom: 40, gap: 16 }, header: { flexDirection: "row", alignItems: "center", gap: 12 }, backButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" }, headerCopy: { flex: 1 }, eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 3 }, title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.6 }, summaryCard: { gap: 11, marginTop: 4 }, summaryEyebrow: { color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 }, summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, summaryValue: { color: "#ffffff", fontSize: 34, fontWeight: "800", letterSpacing: -0.8 }, summaryLabel: { color: "rgba(255,255,255,0.76)", fontSize: 12, fontWeight: "700" }, summaryIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.13)", alignItems: "center", justifyContent: "center" }, sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }, sectionTitle: { fontSize: 18, fontWeight: "800" }, sectionMeta: { fontSize: 10, fontWeight: "800", letterSpacing: 0.7 }, list: { gap: 11 }, sessionCard: { padding: 16, gap: 12 }, sessionTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }, sessionDate: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3 }, sessionTime: { fontSize: 19, fontWeight: "900", marginTop: 4 }, timeBlock: { borderRadius: 12, padding: 11, gap: 4 }, morning: { backgroundColor: "rgba(16, 100, 187, 0.26)" }, midday: { backgroundColor: "rgba(30, 130, 48, 0.25)" }, afternoon: { backgroundColor: "rgba(169, 101, 8, 0.28)" }, timeBlockTime: { color: "#f7f7f8", fontSize: 14, fontWeight: "900" }, timeBlockClient: { color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "700" }, clientRow: { flexDirection: "row", alignItems: "center", gap: 10 }, clientCopy: { flex: 1 }, clientName: { fontSize: 14, fontWeight: "900" }, clientMeta: { fontSize: 11, marginTop: 3 }, capacityPanel: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", justifyContent: "space-between" }, capacityRight: { alignItems: "flex-end" }, capacityValue: { fontSize: 20, fontWeight: "900" }, capacityLabel: { fontSize: 11, marginTop: 2 }, actions: { flexDirection: "row", gap: 8 }, attendanceButton: { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 }, attendanceButtonText: { fontSize: 11, fontWeight: "900" }, emptyCard: { padding: 22, gap: 9, alignItems: "flex-start" }, emptyTitle: { fontSize: 17, fontWeight: "800" }, emptyText: { fontSize: 13, lineHeight: 19, marginBottom: 4 } });
