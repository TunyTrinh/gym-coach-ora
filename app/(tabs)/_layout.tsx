import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useGym } from "@/lib/gym-store";
import { useLanguage } from "@/lib/language-provider";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { snapshot } = useGym();
  const { t } = useLanguage();
  const role = user?.role ?? snapshot.member.role ?? "client";

  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 62 + bottomPadding;

  const isCoach = role === "coach";
  const isAdmin = role === "admin";

  return <Tabs screenOptions={{ tabBarActiveTintColor: "#ff82b7", tabBarInactiveTintColor: "#777780", headerShown: false, tabBarButton: HapticTab, tabBarStyle: { paddingTop: 9, paddingBottom: bottomPadding, height: tabBarHeight, backgroundColor: "#151518", borderTopColor: colors.border, borderTopWidth: 1 }, tabBarLabelStyle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.1 } }}>
    <Tabs.Screen name="index" options={{ title: isCoach ? t("dashboard") : isAdmin ? t("schedule") : t("home"), tabBarIcon: ({ color }) => <IconSymbol size={22} name="house.fill" color={color} /> }} />
    <Tabs.Screen name="schedule" options={{ title: isCoach ? t("schedule") : isAdmin ? t("book") : t("schedule"), tabBarIcon: ({ color }) => <IconSymbol size={22} name="calendar" color={color} /> }} />
    <Tabs.Screen name="book" options={{ title: isCoach ? t("availabilityWorkspace") : isAdmin ? t("users") : t("book"), tabBarIcon: ({ color }) => <IconSymbol size={22} name="calendar.badge.plus" color={color} /> }} />
    <Tabs.Screen name="progress" options={{ title: isCoach ? t("clients") : isAdmin ? t("users") : t("progress"), tabBarIcon: ({ color }) => <IconSymbol size={22} name={isCoach || isAdmin ? "person.2.fill" : "chart.line.uptrend.xyaxis"} color={color} /> }} />
    <Tabs.Screen name="profile" options={{ title: t("profile"), tabBarIcon: ({ color }) => <IconSymbol size={22} name="person.fill" color={color} /> }} />
    <Tabs.Screen name="history" options={{ href: null }} />
  </Tabs>;
}
