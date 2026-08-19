import { color } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Text } from "react-native";
import { AuthLink } from "../../components/auth/AuthLink";
import { AuthShell } from "../../components/auth/AuthShell";
import { FieldError } from "../../components/ui/FieldError";
import { textStyle } from "../../design/typography";
import { useDeepLinkSession } from "../../lib/useDeepLinkSession";

/** Mirrors web's /auth/confirm — lands here from the signup-confirmation email link. */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const state = useDeepLinkSession();

  useEffect(() => {
    if (state === "valid") {
      const id = setTimeout(() => router.replace("/today"), 1200);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [state, router]);

  if (state === "checking") {
    return <AuthShell title="Confirming your email">{null}</AuthShell>;
  }

  if (state === "invalid") {
    return (
      <AuthShell
        title="Confirmation link expired"
        footer={<AuthLink href="/signup">Sign up again</AuthLink>}
      >
        <FieldError>This confirmation link is invalid or has expired.</FieldError>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Email confirmed">
      <Text testID="confirm-success" style={textStyle("body", color.inkMuted)}>
        Taking you to CollegeOS.
      </Text>
    </AuthShell>
  );
}
