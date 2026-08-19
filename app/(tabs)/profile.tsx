import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";

import { Avatar, Divider, ScreenHeader, SpectrumCard, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useLanguage } from "@/lib/language-provider";

export default function ProfileScreen() {
  const colors = useColors();
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const role = user?.role ?? "client";
  const profile = {
    initials: (user?.name ?? "Coachora member").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CM",
    fullName: user?.name?.trim() || "Coachora member",
    email: user?.email ?? "",
  };
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const { state: installState, canInstall, requestInstall } = usePwaInstall();
  const isStaff = role === "coach" || role === "admin";
  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={t("profileTitle")} subtitle="Membership and preferences, in one place." label="ACCOUNT" />
      <SurfaceCard style={styles.profileCard}><Avatar initials={profile.initials} accent="#bba4ff" size={68} /><View style={styles.profileCopy}><Text style={[styles.profileName, { color: colors.foreground }]}>{profile.fullName}</Text><Text style={[styles.profileEmail, { color: colors.muted }]}>{profile.email}</Text><StatusBadge label={role === "client" ? "Client" : role === "coach" ? "Coach" : "Gym Admin"} tone="accent" /></View></SurfaceCard>
      {user ? <Pressable onPress={() => void logout()} accessibilityRole="button" accessibilityLabel={t("signOut")} style={({ pressed }) => [styles.signOutButton, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><Text style={styles.signOutText}>{t("signOut")}</Text></Pressable> : null}
      <Text style={[styles.sectionLabel, { color: colors.muted }]}>MEMBERSHIP</Text>
      <SpectrumCard style={styles.membershipCard} intensity="muted"><View style={styles.membershipTop}><View style={{ flex: 1 }}><Text style={styles.planName}>Coachora account</Text><Text style={styles.planMeta}>Signed in with your verified identity</Text></View><StatusBadge label="Active" tone="success" /></View><View style={styles.progressTrack}><View style={styles.progressFill} /></View><Text style={styles.planFootnote}>Booking access is managed by your gym administrator.</Text></SpectrumCard>
      <Pressable onPress={() => setShowMore((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: showMore }} style={({ pressed }) => [styles.moreRow, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><View><Text style={[styles.moreTitle, { color: colors.foreground }]}>{t("moreOptions")}</Text><Text style={[styles.moreBody, { color: colors.muted }]}>Language, notifications and install help</Text></View><Text style={styles.moreAction}>{showMore ? "Hide" : "Show"}</Text></Pressable>
      {showMore ? <>
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t("language").toUpperCase()}</Text>
        <SurfaceCard style={styles.settingsCard}>
          <View style={{ gap: 8, paddingVertical: 4 }}>
            <Text style={[styles.preferenceLabel, { color: colors.foreground }]}>{t("language")}</Text>
            <View style={styles.langRow}>
              <Pressable
                onPress={() => setLanguage("en")}
                style={[styles.langBtn, language === "en" && styles.langBtnActive]}
                accessibilityRole="button"
                accessibilityLabel="English"
              >
                <Text style={[styles.langText, language === "en" && styles.langTextActive]}>{t("english")}</Text>
              </Pressable>
              <Pressable
                onPress={() => setLanguage("vi")}
                style={[styles.langBtn, language === "vi" && styles.langBtnActive]}
                accessibilityRole="button"
                accessibilityLabel="Tiếng Việt"
              >
                <Text style={[styles.langText, language === "vi" && styles.langTextActive]}>{t("vietnamese")}</Text>
              </Pressable>
            </View>
          </View>
        </SurfaceCard>
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>{t("notifications").toUpperCase()}</Text>
        <SurfaceCard style={styles.settingsCard}><PreferenceRow label="Push reminders" detail="Upcoming sessions and gym updates" value={pushEnabled} onValueChange={setPushEnabled} /><Divider /><PreferenceRow label="Email fallback" detail="Receive important booking changes" value={emailEnabled} onValueChange={setEmailEnabled} /></SurfaceCard>
        {installState !== "installed" && installState !== "unsupported" ? <><Text style={[styles.sectionLabel, { color: colors.muted }]}>{t("installCoachora")}</Text><Pressable onPress={() => void requestInstall()} disabled={!canInstall} accessibilityRole={canInstall ? "button" : undefined} accessibilityState={{ disabled: !canInstall }} style={({ pressed }) => [styles.installCard, { backgroundColor: colors.surface, borderColor: colors.border }, canInstall && pressed && styles.pressed]}><View style={styles.installIcon}><Text style={styles.installIconText}>↗</Text></View><View style={styles.installCopy}><Text style={[styles.installTitle, { color: colors.foreground }]}>{canInstall ? t("installNow") : t("addToHomeScreen")}</Text><Text style={[styles.installBody, { color: colors.muted }]}>{canInstall ? t("installReady") : t("installInstructions")}</Text>{canInstall ? <View style={styles.installAction}><Text style={styles.installActionText}>{t("installNow")}</Text></View> : null}</View></Pressable></> : null}</> : null}
      <Text style={[styles.sectionLabel, { color: colors.muted }]}>ACTIVITY</Text>
      <SurfaceCard style={styles.activityCard} onPress={() => router.push("/history")} accessibilityLabel="Open attendance history"><View><Text style={[styles.activityTitle, { color: colors.foreground }]}>Attendance history</Text><Text style={[styles.activityDetail, { color: colors.muted }]}>Review completed sessions and past activity.</Text></View><Text style={styles.activityArrow}>→</Text></SurfaceCard>
      {isStaff ? <SpectrumCard style={styles.staffCard} onPress={() => router.push("/availability")} accessibilityLabel="Open coach availability"><View><Text style={styles.staffEyebrow}>STAFF VIEW</Text><Text style={styles.staffTitle}>{role === "admin" ? "Coach availability oversight" : "Manage your availability"}</Text><Text style={styles.staffBody}>{role === "admin" ? "Review and manage bookable time across coaches." : "Publish, block, and release your future coaching shifts."}</Text></View><Text style={styles.staffArrow}>→</Text></SpectrumCard> : null}
      {role === "admin" ? <SpectrumCard style={styles.staffCard} onPress={() => router.push("/admin")} accessibilityRole="button" accessibilityLabel={t("coachAccounts")}><View><Text style={styles.staffEyebrow}>{t("admin").toUpperCase()}</Text><Text style={styles.staffTitle}>{t("coachAccounts")}</Text><Text style={styles.staffBody}>{t("coachAccountsBody")}</Text></View><Text style={styles.staffArrow}>→</Text></SpectrumCard> : null}
      {role === "admin" ? <SpectrumCard style={styles.staffCard} onPress={() => router.push("/rooms")} accessibilityRole="button" accessibilityLabel={t("manageRooms")}><View><Text style={styles.staffEyebrow}>{t("admin").toUpperCase()}</Text><Text style={styles.staffTitle}>{t("manageRooms")}</Text><Text style={styles.staffBody}>{t("roomsBody")}</Text></View><Text style={styles.staffArrow}>→</Text></SpectrumCard> : null}
    </ScrollView>
  </ScreenContainer>;
}

function PreferenceRow({ label, detail, value, onValueChange }: { label: string; detail: string; value: boolean; onValueChange: (value: boolean) => void }) {
  const colors = useColors();
  return <View style={styles.preferenceRow}><View style={styles.preferenceCopy}><Text style={[styles.preferenceLabel, { color: colors.foreground }]}>{label}</Text><Text style={[styles.preferenceDetail, { color: colors.muted }]}>{detail}</Text></View><Switch value={value} onValueChange={onValueChange} trackColor={{ false: "#303036", true: "#f0448880" }} thumbColor={value ? "#ff82b7" : "#f4f4f5"} accessibilityLabel={label} /></View>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 12 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 5 },
  profileCopy: { flex: 1, gap: 5 }, profileName: { fontSize: 18, fontWeight: "800" }, profileEmail: { fontSize: 12 },
  signOutButton: { minHeight: 50, borderRadius: 16, borderWidth: 1, justifyContent: "center", alignItems: "center", marginTop: 8 }, signOutText: { color: "#ff82b7", fontSize: 14, fontWeight: "800" },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginTop: 12, marginLeft: 2 },
  membershipCard: { minHeight: 152 }, membershipTop: { flexDirection: "row", alignItems: "center", gap: 10 }, planName: { color: "#ffffff", fontSize: 17, fontWeight: "800" }, planMeta: { color: "rgba(255,255,255,0.76)", fontSize: 12, marginTop: 4 }, progressTrack: { height: 7, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(13,13,15,0.28)", marginTop: 18 }, progressFill: { height: 7, width: "74%", borderRadius: 4, backgroundColor: "#ffffff" }, planFootnote: { color: "rgba(255,255,255,0.76)", fontSize: 11, fontWeight: "700", marginTop: 10 },
  moreRow: { minHeight: 62, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, moreTitle: { fontSize: 14, fontWeight: "800" }, moreBody: { fontSize: 11, marginTop: 4 }, moreAction: { color: "#ff82b7", fontSize: 12, fontWeight: "800" }, settingsCard: { gap: 4 }, preferenceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingVertical: 4 }, preferenceCopy: { flex: 1, gap: 3 }, preferenceLabel: { fontSize: 14, fontWeight: "800" }, preferenceDetail: { fontSize: 11, lineHeight: 17 },
  activityCard: { minHeight: 70, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, activityTitle: { fontSize: 14, fontWeight: "800" }, activityDetail: { fontSize: 11, marginTop: 4 }, activityArrow: { color: "#ff82b7", fontSize: 22 },
  installCard: { flexDirection: "row", gap: 12, alignItems: "flex-start", borderRadius: 18, borderWidth: 1, padding: 16 }, installIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#2b1f2a" }, installIconText: { color: "#ff82b7", fontSize: 20, fontWeight: "700" }, installCopy: { flex: 1, gap: 5 }, installTitle: { fontSize: 14, fontWeight: "800" }, installBody: { fontSize: 12, lineHeight: 18 }, installAction: { alignSelf: "flex-start", marginTop: 5, backgroundColor: "#f04488", borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 }, installActionText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  staffCard: { minHeight: 132, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 6 }, staffEyebrow: { color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 }, staffTitle: { color: "#ffffff", fontSize: 18, fontWeight: "800", marginTop: 5 }, staffBody: { color: "rgba(255,255,255,0.76)", fontSize: 12, marginTop: 5 }, staffArrow: { color: "#ffffff", fontSize: 28 },
  demoCard: { gap: 11 }, demoTitle: { fontSize: 15, fontWeight: "800" }, demoBody: { fontSize: 12, lineHeight: 18 }, roleRow: { flexDirection: "row", gap: 8, marginBottom: 2 }, roleButton: { flex: 1, borderWidth: 1, borderRadius: 13, alignItems: "center", paddingVertical: 10 }, roleButtonText: { fontSize: 12, fontWeight: "800" }, pressed: { opacity: 0.72 },
  langRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  langBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#333", backgroundColor: "#1d1d21", alignItems: "center" },
  langBtnActive: { backgroundColor: "#f04488", borderColor: "#f04488" },
  langText: { fontSize: 12, fontWeight: "700", color: "#b4b4bd" },
  langTextActive: { color: "#ffffff" },
});
