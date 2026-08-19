import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useMemo } from "react";

import { OfflineBanner, PrimaryButton, ScreenHeader, StatCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useLanguage } from "@/lib/language-provider";
import { trpc } from "@/lib/trpc";
import { formatDateLocalized, formatTimeLocalized } from "@/lib/i18n";

import { useAuth } from "@/hooks/use-auth";

export default function HomeScreen() {
  const { user } = useAuth();
  const role = user?.role ?? "client";
  const { language, t } = useLanguage();
  const isOnline = useNetworkStatus();
  const productionSchedule = trpc.member.schedule.useQuery(undefined, { enabled: role === "client" });
  const productionNotifications = trpc.member.notifications.useQuery(undefined, { enabled: Boolean(user) });
  const nextServerBooking = useMemo(() => (productionSchedule.data ?? []).find((booking) => ["pending", "confirmed"].includes(booking.status) && new Date(booking.startAt) > new Date()), [productionSchedule.data]);
  const hasNextBooking = Boolean(nextServerBooking);
  const firstName = (user?.name?.trim() || "Coachora member").split(" ")[0];
  const activeUnreadCount = (productionNotifications.data ?? []).filter((notification) => !notification.read).length;
  const coachSchedule = trpc.availability.coachSchedule.useQuery(undefined, { enabled: role === "coach" });
  const adminRooms = trpc.admin.listRooms.useQuery(undefined, { enabled: role === "admin" });
  const adminCoaches = trpc.admin.listCoachAccounts.useQuery(undefined, { enabled: role === "admin" });
  const coachToday = useMemo(() => (coachSchedule.data ?? []).filter((row) => new Date(row.startAt).toDateString() === new Date().toDateString()), [coachSchedule.data]);
  const coachBookedHours = useMemo(() => coachToday.reduce((total, row) => total + Math.max(0, new Date(row.endAt).getTime() - new Date(row.startAt).getTime()) / 3_600_000, 0), [coachToday]);

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={`${t("welcomeBack")}, ${firstName}`} subtitle={role === "coach" ? t("dashboard") : role === "admin" ? t("adminHub") : t("findYourTime")} onPress={() => router.push("/notifications")} badge={activeUnreadCount} label={role === "coach" ? t("coachLabel") : role === "admin" ? t("admin") : "Coachora"} />
      {!isOnline ? <OfflineBanner label={t("offlineNow")} /> : null}

      {role === "client" ? <>
        <PrimaryButton title={t("bookSessionTitle")} onPress={() => router.push("/book")} icon="calendar.badge.plus" />
        <Text style={[styles.sectionLabel, { color: "#A1A1AA" }]}>{t("upcomingSchedule").toUpperCase()}</Text>
        <SurfaceCard style={styles.nextSessionCard} onPress={() => router.push("/schedule")} accessibilityLabel={t("upcomingSchedule")}><View style={styles.listCopy}><Text style={styles.listTitle}>{hasNextBooking ? t("session") : t("noSessionYet")}</Text><Text style={styles.listMeta}>{nextServerBooking ? `${formatDateLocalized(new Date(nextServerBooking.startAt).toISOString(), language)} · ${formatTimeLocalized(new Date(nextServerBooking.startAt).toISOString(), language)}` : t("bookSessionSubtitle")}</Text></View><StatusBadge label={hasNextBooking ? t("booked") : t("available")} tone={hasNextBooking ? "pro" : "success"} /></SurfaceCard>
      </> : null}

      {role === "coach" ? <>
        <View style={styles.statRow}><StatCard value={String(coachToday.length)} label="Clients today" /><StatCard value={`${coachBookedHours.toFixed(1)}h`} label="Booked hours" /><StatCard value={String(Math.max(0, 8 - coachToday.length))} label="Open slots" /></View>
        <Text style={[styles.sectionLabel, { color: "#A1A1AA" }]}>UP NEXT</Text>
        <View style={styles.sessionList}>{coachToday.slice(0, 2).map((session) => <SurfaceCard key={session.id} style={styles.sessionRow}><View style={[styles.sessionAccent, { backgroundColor: session.status === "confirmed" ? "#34D399" : "#F59E0B" }]} /><View style={styles.listCopy}><Text style={styles.listTitle}>{session.clientName ?? t("clients")}</Text><Text style={styles.listMeta}>{formatTimeLocalized(session.startAt, language)}–{formatTimeLocalized(session.endAt, language)} · {session.room}</Text></View><StatusBadge label={session.status} tone={session.status === "confirmed" ? "success" : "warning"} /></SurfaceCard>)}</View>
        <PrimaryButton title="Publish availability" onPress={() => router.push("/availability")} icon="plus" />
      </> : null}

      {role === "admin" ? <>
        <View style={styles.statRow}><StatCard value={String(adminRooms.data?.length ?? 0)} label={t("rooms")} /><StatCard value={String(adminCoaches.data?.length ?? 0)} label={t("coaches")} /><StatCard value="—" label="Bookings today" /></View>
        <View style={styles.sectionHeading}><Text style={[styles.sectionLabel, { color: "#A1A1AA" }]}>{t("rooms").toUpperCase()}</Text><Pressable onPress={() => router.push("/rooms")} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }}><Text style={styles.manageLink}>{t("manageRooms")}</Text></Pressable></View>
        <View style={styles.sessionList}>{(adminRooms.data ?? []).slice(0, 4).map((room) => <SurfaceCard key={room.id} style={styles.nextSessionCard} onPress={() => router.push("/rooms")}><View style={styles.listCopy}><Text style={styles.listTitle}>{room.name}</Text><Text style={styles.listMeta}>{room.maximumCapacity} {t("clientsAtATime")}</Text></View><StatusBadge label={room.active ? t("available") : t("roomInactive")} tone={room.active ? "success" : "neutral"} /></SurfaceCard>)}</View>
      </> : null}
    </ScrollView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 28, paddingBottom: 38, gap: 18 },
  heroCard: { minHeight: 206 },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  heroHeading: { flex: 1 },
  heroEyebrow: { color: "rgba(255,255,255,0.76)", fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 6 },
  heroTitle: { color: "#ffffff", fontSize: 25, fontWeight: "800", letterSpacing: -0.65 },
  heroDate: { color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: "800", marginTop: 19 },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  heroCopy: { flex: 1 }, heroMeta: { color: "#ffffff", fontSize: 14, fontWeight: "800" }, heroMetaMuted: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 3 },
  heroArrow: { color: "#ffffff", fontSize: 24, fontWeight: "400", paddingHorizontal: 5 },
  heroEmpty: { color: "rgba(255,255,255,0.82)", fontSize: 13, lineHeight: 20, marginTop: 19, maxWidth: 260 },
  metaIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(13,13,15,0.2)", alignItems: "center", justifyContent: "center" }, metaIconText: { color: "#ffffff", fontSize: 18 },
  primaryAction: { minHeight: 116, borderRadius: 24, backgroundColor: "#26222b", borderWidth: 1, borderColor: "rgba(255,130,183,0.42)", paddingHorizontal: 19, paddingVertical: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  primaryEyebrow: { color: "#ff82b7", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }, primaryTitle: { color: "#ffffff", fontSize: 20, fontWeight: "900", letterSpacing: -0.35, marginTop: 5 }, primaryCopy: { color: "#b4b4bd", fontSize: 12, marginTop: 4 },
  primaryArrow: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#f04488" }, primaryArrowText: { color: "#ffffff", fontSize: 26, fontWeight: "300", lineHeight: 30 },
  sectionLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5, marginLeft: 2, marginTop: 4 }, nextSessionCard: { minHeight: 78, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, listCopy: { flex: 1, gap: 4 }, listTitle: { color: "#F5F5F7", fontSize: 13, fontWeight: "600" }, listMeta: { color: "#A1A1AA", fontSize: 12 }, statRow: { flexDirection: "row", gap: 8 }, sessionList: { gap: 8 }, sessionRow: { minHeight: 78, paddingLeft: 14, flexDirection: "row", alignItems: "center", gap: 10 }, sessionAccent: { width: 4, alignSelf: "stretch", borderRadius: 999 }, sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, manageLink: { color: "#EC4899", fontSize: 13, fontWeight: "600" },
  summaryRow: { flexDirection: "row", gap: 11 }, summaryCard: { flex: 1, minHeight: 118, justifyContent: "space-between", padding: 16 }, summaryValue: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 }, summaryTitle: { fontSize: 14, fontWeight: "800", marginTop: 10 }, summaryCopy: { fontSize: 11, marginTop: 3 },
  primaryPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] }, primaryReducedPressed: { opacity: 0.78 },
});
