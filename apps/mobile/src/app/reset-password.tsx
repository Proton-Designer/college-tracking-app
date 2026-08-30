import { color } from "@collegeos/design/native";
import { updatePassword } from "@collegeos/api";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { AuthLink } from "../components/auth/AuthLink";
import { AuthShell } from "../components/auth/AuthShell";
import { Button } from "../components/ui/Button";
import { FieldError } from "../components/ui/FieldError";
import { Input } from "../components/ui/Input";
import { textStyle } from "../design/typography";
import { useDeepLinkSession } from "../lib/useDeepLinkSession";
import { getMobileSupabaseClient } from "../lib/supabase/client";

const MIN_PASSWORD_LENGTH = 10;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const linkState = useDeepLinkSession();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setFormError(null);

    const nextFieldErrors: typeof fieldErrors = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      nextFieldErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (confirmPassword !== password) {
      nextFieldErrors.confirm = "Passwords don't match.";
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setSubmitting(true);
    const result = await updatePassword(getMobileSupabaseClient(), password);
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }

    setSubmitted(true);
    setTimeout(() => router.replace("/today"), 1500);
  }

  if (linkState === "checking") {
    return <AuthShell title="Reset your password">{null}</AuthShell>;
  }

  if (linkState === "invalid") {
    return (
      <AuthShell
        title="Link expired"
        footer={<AuthLink href="/forgot-password">Request a new link</AuthLink>}
      >
        <FieldError>This reset link is invalid or has expired.</FieldError>
      </AuthShell>
    );
  }

  if (submitted) {
    return (
      <AuthShell title="Password updated">
        <Text testID="reset-password-success" style={textStyle("body", color.inkMuted)}>
          Taking you to Ihsan.
        </Text>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password">
      <View style={{ gap: 20 }}>
        <Input
          testID="reset-password-input"
          label="New password"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
          editable={!submitting}
        />
        <Input
          testID="reset-password-confirm-input"
          label="Confirm password"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          error={fieldErrors.confirm}
          editable={!submitting}
        />
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Button testID="reset-password-submit" loading={submitting} onPress={handleSubmit}>
          Update password
        </Button>
      </View>
    </AuthShell>
  );
}
