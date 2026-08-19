import { color } from "@collegeos/design/native";
import { Link, type LinkProps } from "expo-router";
import { textStyle } from "../../design/typography";

/** The accent underlined link style web's auth footers use, factored out so every auth
 *  screen's footer looks identical rather than each re-declaring the style inline. */
export function AuthLink(props: LinkProps) {
  return <Link {...props} style={[textStyle("body", color.accent), styles.underline, props.style]} />;
}

const styles = { underline: { textDecorationLine: "underline" as const } };
