import { signIn } from "@collegeos/api";
import { useRouter } from "expo-router";
import * as Network from "expo-network";
import { useState } from "react";
import { View } from "react-native";
import { AuthLink } from "../components/auth/AuthLink";
import { AuthShell } from "../components/auth/AuthShell";
import { Button } from "../components/ui/Button";
import { FieldError } from "../components/ui/FieldError";
import { Input } from "../components/ui/Input";
import { getMobileSupabaseClient } from "../lib/supabase/client";

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setFormError(null);

    const nextFieldErrors: typeof fieldErrors = {};
    if (!email.trim()) nextFieldErrors.email = "Enter your email address.";
    if (!password) nextFieldErrors.password = "Enter your password.";
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    const network = await Network.getNetworkStateAsync();
    if (network.isConnected === false) {
      setFormError("You're offline. Check your connection and try again.");
      return;
    }

    setSubmitting(true);
    const result = await signIn(getMobileSupabaseClient(), { email, password });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }

    router.replace("/today");
  }

  return (
    <AuthShell
      title="Sign in"
      footer={
        <>
          <AuthLink href="/forgot-password" testID="forgot-password-link">
            Forgot your password?
          </AuthLink>
          <View style={{ marginTop: 12 }}>
            <AuthLink href="/signup" testID="signup-link">
              No account? Create one
            </AuthLink>
          </View>
        </>
      }
    >
      <View style={{ gap: 20 }}>
        <Input
          testID="email-input"
          label="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
          editable={!submitting}
        />
        <Input
          testID="password-input"
          label="Password"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
          editable={!submitting}
        />
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Button testID="login-submit" loading={submitting} onPress={handleSubmit}>
          Sign in
        </Button>
      </View>
    </AuthShell>
  );
}
