import { color } from "@collegeos/design/native";
import { signUp } from "@collegeos/api";
import * as Network from "expo-network";
import { useState } from "react";
import { Text, View } from "react-native";
import { AuthLink } from "../components/auth/AuthLink";
import { AuthShell } from "../components/auth/AuthShell";
import { Button } from "../components/ui/Button";
import { FieldError } from "../components/ui/FieldError";
import { Input } from "../components/ui/Input";
import { textStyle } from "../design/typography";
import { getAuthCallbackUrl } from "../lib/deepLink";
import { getMobileSupabaseClient } from "../lib/supabase/client";

const MIN_PASSWORD_LENGTH = 10;

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setFormError(null);

    const nextFieldErrors: typeof fieldErrors = {};
    if (!email.trim()) nextFieldErrors.email = "Enter your email address.";
    if (password.length < MIN_PASSWORD_LENGTH) {
      nextFieldErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    const network = await Network.getNetworkStateAsync();
    if (network.isConnected === false) {
      setFormError("You're offline. Check your connection and try again.");
      return;
    }

    setSubmitting(true);
    const result = await signUp(getMobileSupabaseClient(), {
      email,
      password,
      redirectTo: getAuthCallbackUrl(),
    });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }

    // Same copy whether the address was already registered or genuinely new -- the
    // backend is enumeration-safe on purpose (matches web signup/page.tsx exactly).
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthShell title="Check your email">
        <Text testID="signup-success" style={textStyle("body", color.inkMuted)}>
          If {email} isn&apos;t already registered, we&apos;ve sent a confirmation link to it. Follow it to
          finish setting up your account.
        </Text>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      footer={
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Already have an account? <AuthLink href="/login" testID="login-link">Sign in</AuthLink>
        </Text>
      }
    >
      <View style={{ gap: 20 }}>
        <Input
          testID="signup-email-input"
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
          testID="signup-password-input"
          label="Password"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
          editable={!submitting}
        />
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Button testID="signup-submit" loading={submitting} onPress={handleSubmit}>
          Create account
        </Button>
      </View>
    </AuthShell>
  );
}
