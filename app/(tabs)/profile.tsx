import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { Avatar, Divider, GhostButton, ScreenHeader, StatusBadge, SurfaceCard } from "@/components/gym-ui";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useGym } from "@/lib/gym-store";

export default function ProfileScreen() {
  const colors = useColors();
  const { snapshot, updateRole, resetDemoData } = useGym();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const isStaff = snapshot.member.role === "coach" || snapshot.member.role === "admin";

  return <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Profile" subtitle="Your membership and preferences." />
      <SurfaceCard style={styles.profileCard}><Avatar initials={snapshot.member.initials} accent="#b7e4dd" size={68} /><View style={styles.profileCopy}><Text style={[styles.profileName, { color: colors.foreground }]}>{snapshot.member.fullName}</Text><Text style={[styles.profileEmail, { color: colors.muted }]}>{snapshot.member.email}</Text><StatusBadge label={snapshot.member.role === "member" ? "Member" : snapshot.member.role === "coach" ? "Coach" : "Gym Admin"} tone="accent" /></View><Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => Alert.alert("Profile editing", "Name and contact updates will be available once your gym connects its member profile endpoint.")}><Text style={[styles.editText, { color: colors.primary }]}>Edit</Text></Pressable></SurfaceCard>

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>MEMBERSHIP</Text>
      <SurfaceCard style={styles.membershipCard}><View style={styles.membershipTop}><View style={{ flex: 1 }}><Text style={[styles.planName, { color: colors.foreground }]}>{snapshot.member.membershipPlan}</Text><Text style={[styles.planMeta, { color: colors.muted }]}>Active through {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(snapshot.member.membershipEndDate))}</Text></View><StatusBadge label="Active" tone="success" /></View><View style={[styles.progressTrack, { backgroundColor: colors.border }]}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: "74%" }]} /></View><Text style={[styles.planFootnote, { color: colors.muted }]}>42 days remaining · Unlimited bookings</Text></SurfaceCard>

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>NOTIFICATIONS</Text>
      <SurfaceCard style={styles.settingsCard}><PreferenceRow label="Push reminders" detail="Upcoming sessions and gym updates" value={pushEnabled} onValueChange={setPushEnabled} /><Divider /><PreferenceRow label="Email fallback" detail="Receive important booking changes" value={emailEnabled} onValueChange={setEmailEnabled} /></SurfaceCard>

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>INSTALL GYMFLOW</Text>
      <SurfaceCard style={styles.installCard}><View style={[styles.installIcon, { backgroundColor: `${colors.primary}18` }]}><Text style={[styles.installIconText, { color: colors.primary }]}>↗</Text></View><View style={styles.installCopy}><Text style={[styles.installTitle, { color: colors.foreground }]}>Add to your home screen</Text><Text style={[styles.installBody, { color: colors.muted }]}>On iPhone, open GymFlow in Safari, tap Share, then Add to Home Screen. On Android, use Chrome’s Install app prompt.</Text></View></SurfaceCard>

      {isStaff ? <Pressable onPress={() => router.push("/coach")} style={({ pressed }) => [styles.staffCard, { backgroundColor: colors.primary }, pressed ? styles.pressed : undefined]}><View><Text style={styles.staffEyebrow}>STAFF VIEW</Text><Text style={styles.staffTitle}>{snapshot.member.role === "admin" ? "Gym Admin dashboard" : "Coach schedule"}</Text><Text style={styles.staffBody}>Manage sessions, attendance, and attendees.</Text></View><Text style={styles.staffArrow}>→</Text></Pressable> : null}

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>DEMO CONTROLS</Text>
      <SurfaceCard style={styles.demoCard}><Text style={[styles.demoTitle, { color: colors.foreground }]}>Preview role-based views</Text><Text style={[styles.demoBody, { color: colors.muted }]}>Use these controls to review the member and staff flows before connecting your gym’s OAuth roles.</Text><View style={styles.roleRow}><RoleButton label="Member" active={snapshot.member.role === "member"} onPress={() => updateRole("member")} /><RoleButton label="Coach" active={snapshot.member.role === "coach"} onPress={() => updateRole("coach")} /><RoleButton label="Admin" active={snapshot.member.role === "admin"} onPress={() => updateRole("admin")} /></View><GhostButton title="Reset demo data" onPress={() => { resetDemoData(); Alert.alert("Demo reset", "GymFlow is back to its starting schedule."); }} /></SurfaceCard>
    </ScrollView>
  </ScreenContainer>;
}

function PreferenceRow({ label, detail, value, onValueChange }: { label: string; detail: string; value: boolean; onValueChange: (value: boolean) => void }) {
  const colors = useColors();
  return <View style={styles.preferenceRow}><View style={styles.preferenceCopy}><Text style={[styles.preferenceLabel, { color: colors.foreground }]}>{label}</Text><Text style={[styles.preferenceDetail, { color: colors.muted }]}>{detail}</Text></View><Switch value={value} onValueChange={onValueChange} trackColor={{ false: colors.border, true: `${colors.primary}80` }} thumbColor={value ? colors.primary : "#f4f4f5"} accessibilityLabel={label} /></View>;
}

function RoleButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={[styles.roleButton, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? `${colors.primary}15` : colors.surface }]} accessibilityRole="button"><Text style={[styles.roleButtonText, { color: active ? colors.primary : colors.muted }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 12 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 5 },
  profileCopy: { flex: 1, gap: 5 },
  profileName: { fontSize: 18, fontWeight: "800" },
  profileEmail: { fontSize: 12 },
  editText: { fontSize: 12, fontWeight: "800" },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginTop: 12, marginLeft: 2 },
  membershipCard: { gap: 14 },
  membershipTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  planName: { fontSize: 17, fontWeight: "800" },
  planMeta: { fontSize: 12, marginTop: 4 },
  progressTrack: { height: 7, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 7, borderRadius: 4 },
  planFootnote: { fontSize: 11, fontWeight: "700" },
  settingsCard: { gap: 4 },
  preferenceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingVertical: 4 },
  preferenceCopy: { flex: 1, gap: 3 },
  preferenceLabel: { fontSize: 14, fontWeight: "800" },
  preferenceDetail: { fontSize: 11, lineHeight: 17 },
  installCard: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  installIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  installIconText: { fontSize: 20, fontWeight: "700" },
  installCopy: { flex: 1, gap: 5 },
  installTitle: { fontSize: 14, fontWeight: "800" },
  installBody: { fontSize: 12, lineHeight: 18 },
  staffCard: { borderRadius: 22, padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 6 },
  staffEyebrow: { color: "#b6fff3", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  staffTitle: { color: "#ffffff", fontSize: 18, fontWeight: "800", marginTop: 5 },
  staffBody: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 5 },
  staffArrow: { color: "#ffffff", fontSize: 28 },
  demoCard: { gap: 11 },
  demoTitle: { fontSize: 15, fontWeight: "800" },
  demoBody: { fontSize: 12, lineHeight: 18 },
  roleRow: { flexDirection: "row", gap: 8, marginBottom: 2 },
  roleButton: { flex: 1, borderWidth: 1, borderRadius: 13, alignItems: "center", paddingVertical: 10 },
  roleButtonText: { fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.78 },
});
