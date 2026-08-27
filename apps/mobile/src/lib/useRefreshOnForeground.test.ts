import { renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import { useRefreshOnForeground } from "./useRefreshOnForeground";

describe("useRefreshOnForeground", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("calls refresh when AppState transitions to active", async () => {
    const refresh = jest.fn();
    const addListenerSpy = jest.spyOn(AppState, "addEventListener");
    await renderHook(() => useRefreshOnForeground(refresh));

    const call = addListenerSpy.mock.calls[0];
    if (!call) throw new Error("AppState.addEventListener was not called");
    const listener = call[1] as (state: string) => void;

    expect(refresh).not.toHaveBeenCalled();
    listener("active");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not call refresh for a transition to background or inactive", async () => {
    const refresh = jest.fn();
    const addListenerSpy = jest.spyOn(AppState, "addEventListener");
    await renderHook(() => useRefreshOnForeground(refresh));

    const call = addListenerSpy.mock.calls[0];
    if (!call) throw new Error("AppState.addEventListener was not called");
    const listener = call[1] as (state: string) => void;

    listener("background");
    listener("inactive");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("removes the subscription on unmount", async () => {
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockReturnValueOnce({ remove } as ReturnType<
      typeof AppState.addEventListener
    >);

    const { unmount } = await renderHook(() => useRefreshOnForeground(jest.fn()));
    await unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
