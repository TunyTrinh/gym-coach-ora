import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Avatar, OfflineBanner, ScreenHeader, SpectrumCard, StatusBadge } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useGym } from "@/lib/gym-store";
import { haptic } from "@/lib/haptics";
import { useLanguage } from "@/lib/language-provider";
import { formatDateLocalized, formatTimeLocalized } from "@/lib/i18n";
import { getBookingSlot, getCoach, getService } from "@/shared/gym";

import { useAuth } from "@/hooks/use-auth";

export default function HomeScreen() {
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const role = user?.role || "client";
  const { snapshot, upcomingBookings, unreadCount } = useGym();
  const { language, t } = useLanguage();
  const isOnline = useNetworkStatus();
  const nextBooking = upcomingBookings[0];
  const nextSlot = nextBooking ? getBookingSlot(snapshot, nextBooking) : undefined;
  const nextService = nextSlot ? getService(snapshot, nextSlot.serviceTypeId) : undefined;
  const nextCoach = nextSlot ? getCoach(snapshot, nextSlot.coachId) : undefined;
  const firstName = snapshot.member.fullName.split(" ")[0];

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={`${t("welcomeBack")}, ${firstName}`} subtitle={role === "coach" ? t("dashboard") : role === "admin" ? t("adminHub") : t("findYourTime")} onPress={() => router.push("/notifications")} badge={unreadCount} label={role === "coach" ? t("coachLabel") : role === "admin" ? t("admin") : "Coachora"} />
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

        {role === "client" && <SpectrumCard style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroHeading}><Text style={styles.heroEyebrow}>{nextBooking ? t("nextSession") : t("findYourTime").toUpperCase()}</Text><Text style={styles.heroTitle}>{nextService?.name ?? t("noSessionYet")}</Text></View>
            <StatusBadge label={nextBooking ? t("booked") : t("available")} tone={nextBooking ? "success" : "accent"} />
          </View>
          {nextSlot ? <>
            <Text style={styles.heroDate}>{formatDateLocalized(nextSlot.start, language)} · {formatTimeLocalized(nextSlot.start, language)}</Text>
            <View style={styles.heroMetaRow}>{nextCoach ? <Avatar initials={nextCoach.initials} accent={nextCoach.accent} size={36} /> : <View style={styles.metaIcon}><Text style={styles.metaIconText}>⌁</Text></View>}<View style={styles.heroCopy}><Text style={styles.heroMeta}>{nextCoach?.fullName ?? t("openGymAccess")}</Text><Text style={styles.heroMetaMuted}>{nextSlot.room} · {snapshot.gyms[0]?.name}</Text></View><Text style={styles.heroArrow}>→</Text></View>
          </> : <Text style={styles.heroEmpty}>{t("bookSessionSubtitle")}</Text>}
        </SpectrumCard>}
      </>

      {role === "client" ? <Pressable onPress={() => { haptic.light(); router.push("/book"); }} style={({ pressed }) => [styles.primaryAction, pressed && (reducedMotion ? styles.primaryReducedPressed : styles.primaryPressed)]} accessibilityRole="button" accessibilityLabel={t("bookSessionTitle")}>
        <View><Text style={styles.primaryEyebrow}>{t("findYourTime").toUpperCase()}</Text><Text style={styles.primaryTitle}>{t("bookSessionTitle")}</Text><Text style={styles.primaryCopy}>{t("bookSessionSubtitle")}</Text></View><View style={styles.primaryArrow}><Text style={styles.primaryArrowText}>+</Text></View>
      </Pressable> : null}
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
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginLeft: 2, marginTop: 4 },
  summaryRow: { flexDirection: "row", gap: 11 }, summaryCard: { flex: 1, minHeight: 118, justifyContent: "space-between", padding: 16 }, summaryValue: { fontSize: 22, fontWeight: "900", letterSpacing: -0.5 }, summaryTitle: { fontSize: 14, fontWeight: "800", marginTop: 10 }, summaryCopy: { fontSize: 11, marginTop: 3 },
  primaryPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] }, primaryReducedPressed: { opacity: 0.78 },
});
