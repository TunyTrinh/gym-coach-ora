import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useLanguage } from "@/lib/language-provider";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const role = user?.role ?? "client";

  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 62 + bottomPadding;

  const isCoach = role === "coach";
  const isAdmin = role === "admin";
  const isClient = !isCoach && !isAdmin;

  return <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.mutedStrong, headerShown: false, tabBarButton: HapticTab, tabBarStyle: { paddingTop: 9, paddingBottom: bottomPadding, height: tabBarHeight, backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 }, tabBarLabelStyle: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 } }}>
    <Tabs.Screen name="index" options={{ title: isCoach ? t("today") : isAdmin ? t("overview") : t("home"), tabBarIcon: ({ color }) => <IconSymbol size={22} name="house.fill" color={color} /> }} />
    <Tabs.Screen name="schedule" options={{ href: isAdmin ? null : undefined, title: t("schedule"), tabBarIcon: ({ color }) => <IconSymbol size={22} name="calendar" color={color} /> }} />
    <Tabs.Screen name="book" options={{ href: null }} />
    <Tabs.Screen name="progress" options={{ href: isCoach ? undefined : null, title: t("clients"), tabBarIcon: ({ color }) => <IconSymbol size={22} name="person.2.fill" color={color} /> }} />
    <Tabs.Screen name="history" options={{ href: isClient ? undefined : null, title: t("history"), tabBarIcon: ({ color }) => <IconSymbol size={22} name="clock" color={color} /> }} />
    <Tabs.Screen name="profile" options={{ href: isAdmin ? null : undefined, title: t("profile"), tabBarIcon: ({ color }) => <IconSymbol size={22} name="person.fill" color={color} /> }} />
    <Tabs.Screen name="rooms" options={{ href: isAdmin ? undefined : null, title: t("rooms"), tabBarIcon: ({ color }) => <IconSymbol size={22} name="map" color={color} /> }} />
    <Tabs.Screen name="admin" options={{ href: isAdmin ? undefined : null, title: t("coaches"), tabBarIcon: ({ color }) => <IconSymbol size={22} name="person.2.fill" color={color} /> }} />
    <Tabs.Screen name="reports" options={{ href: isAdmin ? undefined : null, title: t("reports"), tabBarIcon: ({ color }) => <IconSymbol size={22} name="chart.bar" color={color} /> }} />
  </Tabs>;
}
