import { ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSegments } from "expo-router";

import { getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/lib/language-provider";
import { isLocalTestMode } from "@/lib/local-test-mode";

function googleSignInUrl() {
  return `${getApiBaseUrl()}/api/auth/google`;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const { t } = useLanguage();
  const segments = useSegments();
  const isOAuthCallback = segments[0] === "oauth";

  const continueWithGoogle = async () => {
    const url = googleSignInUrl();
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.assign(url);
      return;
    }
    await Linking.openURL(url);
  };

  if (isOAuthCallback || isAuthenticated || isLocalTestMode()) return <>{children}</>;

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color="#ff82b7" /><Text style={styles.loadingText}>{t("loading")}</Text></View>;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />
      <View style={styles.card}>
        <Image source={require("../assets/images/coachora-logo-full.png")} accessibilityLabel="Coachora" style={styles.logo} />
        <Text style={styles.title}>{t("signInRequired")}</Text>
        <Text style={styles.body}>{t("signInRequiredBody")}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t("continueWithGoogle")} onPress={continueWithGoogle} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>{t("continueWithGoogle")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0d0d0f", padding: 24, overflow: "hidden" },
  glowOne: { position: "absolute", width: 280, height: 280, borderRadius: 140, backgroundColor: "#975bd7", opacity: 0.16, top: -120, right: -80 },
  glowTwo: { position: "absolute", width: 240, height: 240, borderRadius: 120, backgroundColor: "#f04488", opacity: 0.12, bottom: -100, left: -80 },
  card: { width: "100%", maxWidth: 390, alignItems: "center", borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(29,29,33,0.96)", paddingHorizontal: 24, paddingVertical: 34, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 28, elevation: 8 },
  logo: { width: 136, height: 154, resizeMode: "contain", marginBottom: 4 },
  title: { color: "#f7f7f8", fontSize: 24, lineHeight: 31, fontWeight: "800", textAlign: "center", marginTop: 6 },
  body: { color: "#b4b4bd", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 290 },
  button: { width: "100%", minHeight: 52, borderRadius: 16, justifyContent: "center", alignItems: "center", marginTop: 26, backgroundColor: "#f04488" },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#0d0d0f" },
  loadingText: { color: "#b4b4bd", fontSize: 13, fontWeight: "700" },
});
