import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 62 + bottomPadding;

  return <Tabs screenOptions={{ tabBarActiveTintColor: "#ff82b7", tabBarInactiveTintColor: "#777780", headerShown: false, tabBarButton: HapticTab, tabBarStyle: { paddingTop: 9, paddingBottom: bottomPadding, height: tabBarHeight, backgroundColor: "#151518", borderTopColor: colors.border, borderTopWidth: 1 }, tabBarLabelStyle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.1 } }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <IconSymbol size={22} name="house.fill" color={color} /> }} />
    <Tabs.Screen name="book" options={{ title: "Book", tabBarIcon: ({ color }) => <IconSymbol size={22} name="calendar.badge.plus" color={color} /> }} />
    <Tabs.Screen name="schedule" options={{ title: "Schedule", tabBarIcon: ({ color }) => <IconSymbol size={22} name="calendar" color={color} /> }} />
    <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: ({ color }) => <IconSymbol size={22} name="clock" color={color} /> }} />
    <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <IconSymbol size={22} name="person.fill" color={color} /> }} />
  </Tabs>;
}
