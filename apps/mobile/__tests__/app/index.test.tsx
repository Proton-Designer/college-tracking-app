import { render, screen } from "@testing-library/react-native";
import Index from "../../src/app/index";

describe("Welcome screen", () => {
  it("renders the CollegeOS wordmark and headline", async () => {
    await render(<Index />);

    expect(screen.getByTestId("app-heading")).toHaveTextContent(/The day you planned\..*The day you had\./);
  });

  it("offers exactly the two entry actions -- sign up and sign in", async () => {
    await render(<Index />);

    expect(screen.getByTestId("hero-signup")).toBeTruthy();
    expect(screen.getByTestId("hero-login")).toBeTruthy();
  });
});
