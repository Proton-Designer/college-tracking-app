import { render, screen } from "@testing-library/react-native";
import Index from "../../src/app/index";

describe("Index", () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  });

  it("renders and surfaces the local Supabase environment", async () => {
    await render(<Index />);

    expect(screen.getByTestId("app-heading")).toHaveTextContent("CollegeOS");
    expect(screen.getByTestId("env-source")).toHaveTextContent("mobile");
    expect(screen.getByTestId("env-mode")).toHaveTextContent("local");
    expect(screen.getByTestId("env-supabase-url")).toHaveTextContent("http://127.0.0.1:54321");
  });

  it("throws a clear error when Supabase env vars are missing", async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    await expect(render(<Index />)).rejects.toThrow(/Missing Supabase environment configuration/);
  });
});
