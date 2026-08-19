import { ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSegments } from "expo-router";
import { useState } from "react";

import { getApiBaseUrl, getRedirectUri } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { useLanguage } from "@/lib/language-provider";
import { PreviewAccountSwitcher } from "@/components/preview-account-switcher";

function googleSignInUrl() {
  const url = new URL(`${getApiBaseUrl()}/api/auth/google`);
  if (Platform.OS !== "web") url.searchParams.set("returnTo", getRedirectUri());
  return url.toString();
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, refresh } = useAuth();
  const { t } = useLanguage();
  const segments = useSegments();
  const isOAuthCallback = segments[0] === "oauth";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showLocalAccount, setShowLocalAccount] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const continueWithGoogle = async () => {
    const url = googleSignInUrl();
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.assign(url);
      return;
    }
    await Linking.openURL(url);
  };

  const continueWithLocalAccount = async () => {
    if (!username.trim() || !password) {
      setLocalError(t("localSignInRequired"));
      return;
    }
    setLocalBusy(true);
    setLocalError(null);
    try {
      const result = await Api.localLogin(username, password);
      if (Platform.OS !== "web") await Auth.setSessionToken(result.sessionToken);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setLocalError(message.includes("Too many") ? t("localSignInRateLimited") : t("localSignInFailed"));
    } finally {
      setLocalBusy(false);
    }
  };

  if (isOAuthCallback) return <>{children}</>;
  if (isAuthenticated) return <PreviewAccountSwitcher>{children}</PreviewAccountSwitcher>;

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
        <View style={styles.divider} />
        {!showLocalAccount ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("signInWithAccount")}
            onPress={() => { setShowLocalAccount(true); setLocalError(null); }}
            style={({ pressed }) => [styles.accountLink, pressed && styles.linkPressed]}
          >
            <Text style={styles.accountLinkText}>{t("signInWithAccount")}</Text>
          </Pressable>
        ) : (
          <View style={styles.localAccountForm}>
            <Text style={styles.localHeading}>{t("localAccount")}</Text>
            <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} editable={!localBusy} placeholder={t("username")} placeholderTextColor="#777780" accessibilityLabel={t("username")} style={styles.input} returnKeyType="next" />
            <TextInput value={password} onChangeText={setPassword} secureTextEntry editable={!localBusy} placeholder={t("password")} placeholderTextColor="#777780" accessibilityLabel={t("password")} style={styles.input} returnKeyType="done" onSubmitEditing={() => void continueWithLocalAccount()} />
            {localError ? <Text accessibilityRole="alert" style={styles.errorText}>{localError}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={t("signInWithAccount")} disabled={localBusy} onPress={() => void continueWithLocalAccount()} style={({ pressed }) => [styles.localButton, (pressed || localBusy) && styles.buttonPressed]}>
              {localBusy ? <ActivityIndicator color="#f7f7f8" /> : <Text style={styles.localButtonText}>{t("signInWithAccount")}</Text>}
            </Pressable>
          </View>
        )}
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
  divider: { width: "100%", height: 1, backgroundColor: "#000000", opacity: 0.92, marginTop: 22, marginBottom: 18 },
  accountLink: { paddingHorizontal: 16, paddingVertical: 5 },
  accountLinkText: { color: "#ff82b7", fontSize: 13, fontWeight: "800", textDecorationLine: "underline" },
  linkPressed: { opacity: 0.7 },
  localAccountForm: { width: "100%" },
  localHeading: { width: "100%", color: "#b4b4bd", fontSize: 12, fontWeight: "800", marginBottom: 10 },
  input: { width: "100%", minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: "#000000", backgroundColor: "#111113", color: "#f7f7f8", fontSize: 15, paddingHorizontal: 14, marginBottom: 10 },
  errorText: { width: "100%", color: "#ff766e", fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: -2, marginBottom: 4 },
  localButton: { width: "100%", minHeight: 48, borderRadius: 14, justifyContent: "center", alignItems: "center", marginTop: 2, borderWidth: 1, borderColor: "#35353b", backgroundColor: "#232328" },
  localButtonText: { color: "#f7f7f8", fontSize: 14, fontWeight: "800" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#0d0d0f" },
  loadingText: { color: "#b4b4bd", fontSize: 13, fontWeight: "700" },
});
