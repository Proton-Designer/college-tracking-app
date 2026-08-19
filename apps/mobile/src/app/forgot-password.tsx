import { color } from "@collegeos/design/native";
import { resetPassword } from "@collegeos/api";
import * as Network from "expo-network";
import { useState } from "react";
import { Text, View } from "react-native";
import { AuthLink } from "../components/auth/AuthLink";
import { AuthShell } from "../components/auth/AuthShell";
import { Button } from "../components/ui/Button";
import { FieldError } from "../components/ui/FieldError";
import { Input } from "../components/ui/Input";
import { textStyle } from "../design/typography";
import { getResetPasswordUrl } from "../lib/deepLink";
import { getMobileSupabaseClient } from "../lib/supabase/client";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setFormError(null);

    if (!email.trim()) {
      setFieldError("Enter your email address.");
      return;
    }
    setFieldError(undefined);

    const network = await Network.getNetworkStateAsync();
    if (network.isConnected === false) {
      setFormError("You're offline. Check your connection and try again.");
      return;
    }

    setSubmitting(true);
    const result = await resetPassword(getMobileSupabaseClient(), email, getResetPasswordUrl());
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthShell title="Check your email">
        <Text testID="forgot-password-success" style={textStyle("body", color.inkMuted)}>
          If {email} has an account, we&apos;ve sent a link to reset the password.
        </Text>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Remembered it? <AuthLink href="/login">Sign in</AuthLink>
        </Text>
      }
    >
      <View style={{ gap: 20 }}>
        <Input
          testID="forgot-password-email-input"
          label="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          error={fieldError}
          editable={!submitting}
        />
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Button testID="forgot-password-submit" loading={submitting} onPress={handleSubmit}>
          Send reset link
        </Button>
      </View>
    </AuthShell>
  );
}
