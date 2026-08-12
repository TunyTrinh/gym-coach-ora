import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 58 + bottomPadding;

  return <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, headerShown: false, tabBarButton: HapticTab, tabBarStyle: { paddingTop: 8, paddingBottom: bottomPadding, height: tabBarHeight, backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: 0.5 }, tabBarLabelStyle: { fontSize: 10, fontWeight: "700" } }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <IconSymbol size={23} name="house.fill" color={color} /> }} />
    <Tabs.Screen name="book" options={{ title: "Book", tabBarIcon: ({ color }) => <IconSymbol size={23} name="calendar.badge.plus" color={color} /> }} />
    <Tabs.Screen name="schedule" options={{ title: "Schedule", tabBarIcon: ({ color }) => <IconSymbol size={23} name="calendar" color={color} /> }} />
    <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: ({ color }) => <IconSymbol size={23} name="clock" color={color} /> }} />
    <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <IconSymbol size={23} name="person.fill" color={color} /> }} />
  </Tabs>;
}
