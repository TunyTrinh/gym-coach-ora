import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useMemo } from "react";

import { Avatar, OfflineBanner, ScreenHeader, SpectrumCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useGym } from "@/lib/gym-store";
import { useLanguage } from "@/lib/language-provider";
import { isLocalTestMode } from "@/lib/local-test-mode";
import { trpc } from "@/lib/trpc";
import { formatDateLocalized, formatTimeLocalized } from "@/lib/i18n";
import { getBookingSlot, getCoach, getService } from "@/shared/gym";

import { useAuth } from "@/hooks/use-auth";

export default function HomeScreen() {
  const { user } = useAuth();
  const { snapshot, upcomingBookings, unreadCount } = useGym();
  const previewMode = isLocalTestMode();
  const role = previewMode ? snapshot.member.role : user?.role ?? "client";
  const { language, t } = useLanguage();
  const isOnline = useNetworkStatus();
  const productionSchedule = trpc.member.schedule.useQuery(undefined, { enabled: !previewMode && role === "client" });
  const productionNotifications = trpc.member.notifications.useQuery(undefined, { enabled: !previewMode && Boolean(user) });
  const nextBooking = previewMode ? upcomingBookings[0] : undefined;
  const nextSlot = nextBooking ? getBookingSlot(snapshot, nextBooking) : undefined;
  const nextService = nextSlot ? getService(snapshot, nextSlot.serviceTypeId) : undefined;
  const nextCoach = nextSlot ? getCoach(snapshot, nextSlot.coachId) : undefined;
  const nextServerBooking = useMemo(() => (productionSchedule.data ?? []).find((booking) => ["pending", "confirmed"].includes(booking.status) && new Date(booking.startAt) > new Date()), [productionSchedule.data]);
  const hasNextBooking = previewMode ? Boolean(nextBooking) : Boolean(nextServerBooking);
  const firstName = (previewMode ? snapshot.member.fullName : user?.name?.trim() || "Coachora member").split(" ")[0];
  const activeUnreadCount = previewMode ? unreadCount : (productionNotifications.data ?? []).filter((notification) => !notification.read).length;

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={`${t("welcomeBack")}, ${firstName}`} subtitle={role === "coach" ? t("dashboard") : role === "admin" ? t("adminHub") : t("findYourTime")} onPress={() => router.push("/notifications")} badge={activeUnreadCount} label={role === "coach" ? t("coachLabel") : role === "admin" ? t("admin") : "Coachora"} role={role} />
      {!isOnline ? <OfflineBanner label={t("offlineNow")} /> : null}

      <>
        {role === "coach" && <SpectrumCard style={styles.heroCard} onPress={() => router.push("/book")} accessibilityLabel={t("openCoachAvailability")}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroHeading}><Text style={styles.heroEyebrow}>{t("dashboard").toUpperCase()}</Text><Text style={styles.heroTitle}>{t("upcomingSession")}</Text></View>
            <StatusBadge label={t("active")} tone="success" />
          </View>
          <Text style={styles.heroDate}>{t("manageAvailabilityBody")}</Text>
          <View style={styles.heroMetaRow}><View style={styles.metaIcon}><Text style={styles.metaIconText}>⌘</Text></View><View style={styles.heroCopy}><Text style={styles.heroMeta}>{t("availability")}</Text><Text style={styles.heroMetaMuted}>{t("availabilitySubtitle")}</Text></View><Text style={styles.heroArrow}>→</Text></View>
        </SpectrumCard>}

        {role === "admin" && <SpectrumCard style={styles.heroCard} onPress={() => router.push("/schedule")} accessibilityLabel={t("adminHub")}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroHeading}><Text style={styles.heroEyebrow}>{t("adminHub").toUpperCase()}</Text><Text style={styles.heroTitle}>{t("staffSchedule")}</Text></View>
            <StatusBadge label={t("active")} tone="success" />
          </View>
          <Text style={styles.heroDate}>{t("adminAvailabilityBody")}</Text>
          <View style={styles.heroMetaRow}><View style={styles.metaIcon}><Text style={styles.metaIconText}>⚙</Text></View><View style={styles.heroCopy}><Text style={styles.heroMeta}>{t("bookings")}</Text><Text style={styles.heroMetaMuted}>{t("manageCoachTime")}</Text></View><Text style={styles.heroArrow}>→</Text></View>
        </SpectrumCard>}

        {role === "client" && <SpectrumCard style={styles.heroCard} onPress={() => router.push("/book")} accessibilityLabel={t("bookSessionTitle")}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroHeading}><Text style={styles.heroEyebrow}>{hasNextBooking ? t("nextSession") : t("findYourTime").toUpperCase()}</Text><Text style={styles.heroTitle}>{previewMode ? nextService?.name ?? t("noSessionYet") : nextServerBooking?.serviceName ?? t("noSessionYet")}</Text></View>
            <StatusBadge label={hasNextBooking ? t("booked") : t("available")} tone={hasNextBooking ? "success" : "accent"} />
          </View>
          {previewMode && nextSlot ? <>
            <Text style={styles.heroDate}>{formatDateLocalized(nextSlot.start, language)} · {formatTimeLocalized(nextSlot.start, language)}</Text>
            <View style={styles.heroMetaRow}>{nextCoach ? <Avatar initials={nextCoach.initials} accent={nextCoach.accent} size={36} /> : <View style={styles.metaIcon}><Text style={styles.metaIconText}>⌁</Text></View>}<View style={styles.heroCopy}><Text style={styles.heroMeta}>{nextCoach?.fullName ?? t("openGymAccess")}</Text><Text style={styles.heroMetaMuted}>{nextSlot.room} · {snapshot.gyms[0]?.name}</Text></View><Text style={styles.heroArrow}>→</Text></View>
          </> : !previewMode && nextServerBooking ? <>
            <Text style={styles.heroDate}>{formatDateLocalized(new Date(nextServerBooking.startAt).toISOString(), language)} · {formatTimeLocalized(new Date(nextServerBooking.startAt).toISOString(), language)}</Text>
            <View style={styles.heroMetaRow}><View style={styles.metaIcon}><Text style={styles.metaIconText}>⌁</Text></View><View style={styles.heroCopy}><Text style={styles.heroMeta}>{nextServerBooking.coachName ?? t("openGymAccess")}</Text><Text style={styles.heroMetaMuted}>{nextServerBooking.room}</Text></View><Text style={styles.heroArrow}>→</Text></View>
          </> : <Text style={styles.heroEmpty}>{t("bookSessionSubtitle")}</Text>}
        </SpectrumCard>}
      </>

      {role === "coach" ? <SurfaceCard style={styles.glanceCard}><Text style={[styles.glanceEyebrow, { color: "#45C9C0" }]}>{t("monthView").toUpperCase()}</Text><Text style={[styles.glanceTitle, { color: "#F5F5F7" }]}>{t("coachSchedule")}</Text><Text style={[styles.glanceCopy, { color: "#9B9BA8" }]}>{t("scheduleAppears")}</Text></SurfaceCard> : null}
      {role === "admin" ? <SurfaceCard style={styles.glanceCard}><Text style={[styles.glanceEyebrow, { color: "#F2B84B" }]}>{t("admin").toUpperCase()}</Text><Text style={[styles.glanceTitle, { color: "#F5F5F7" }]}>{t("staffSchedule")}</Text><Text style={[styles.glanceCopy, { color: "#9B9BA8" }]}>{t("manageCoachTime")}</Text></SurfaceCard> : null}
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
  glanceCard: { minHeight: 112, justifyContent: "center", gap: 5 }, glanceEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" }, glanceTitle: { fontSize: 17, lineHeight: 22, fontWeight: "700" }, glanceCopy: { fontSize: 13, lineHeight: 20 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginLeft: 2, marginTop: 4 },
  summaryRow: { flexDirection: "row", gap: 11 }, summaryCard: { flex: 1, minHeight: 118, justifyContent: "space-between", padding: 16 }, summaryValue: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 }, summaryTitle: { fontSize: 14, fontWeight: "800", marginTop: 10 }, summaryCopy: { fontSize: 11, marginTop: 3 },
});
