// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  "house.fill": "home",
  "calendar": "calendar-today",
  "calendar.badge.plus": "event-available",
  "chart.line.uptrend.xyaxis": "show-chart",
  "clock": "schedule",
  "bell.fill": "notifications-none",
  "bell.badge.fill": "notifications",
  "person.fill": "person-outline",
  "person.2.fill": "groups",
  "dumbbell.fill": "fitness-center",
  "figure.strengthtraining.traditional": "fitness-center",
  "figure.yoga": "self-improvement",
  "checkmark.circle.fill": "check-circle",
  "checkmark": "check",
  "xmark": "close",
  "xmark.circle": "cancel",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "arrow.right": "arrow-forward",
  "location.fill": "location-on",
  "map": "map",
  "gearshape.fill": "settings",
  "rectangle.portrait.and.arrow.right": "logout",
  "sparkles": "auto-awesome",
  "info.circle": "info-outline",
  "wifi.slash": "wifi-off",
  "slider.horizontal.3": "tune",
  "plus": "add",
  "magnifyingglass": "search",
  "ellipsis": "more-horiz",
} as IconMapping;

export function IconSymbol({ name, size = 24, color, style }: { name: IconSymbolName; size?: number; color: string | OpaqueColorValue; style?: StyleProp<TextStyle>; weight?: SymbolWeight }) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
