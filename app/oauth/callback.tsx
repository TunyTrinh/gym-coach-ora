import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/hooks/use-auth";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function OAuthCallback() {
  const router = useRouter();
  const { refresh } = useAuth();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const handled = useRef(false);
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const completeSignIn = async () => {
      if (params.error) throw new Error("Google sign-in was cancelled or denied.");
      if (!params.code) throw new Error("The sign-in code is missing. Please start again.");

      const result = await Api.exchangeNativeOAuthCode(params.code);
      await Auth.setSessionToken(result.sessionToken);
      await refresh();
      setStatus("success");
      router.replace("/(tabs)");
    };

    void completeSignIn().catch((error) => {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to complete authentication.");
    });
  }, [params.code, params.error, refresh, router]);

  const message = status === "processing"
    ? "Completing authentication..."
    : status === "success"
      ? "Authentication successful."
      : errorMessage;

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "processing" ? <ActivityIndicator size="large" /> : null}
        <Text className="text-base leading-6 text-center text-foreground">{message}</Text>
      </ThemedView>
    </SafeAreaView>
  );
}
