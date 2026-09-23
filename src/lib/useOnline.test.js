import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useOnline } from "./useOnline";

const realNavigator = globalThis.navigator;

describe("useOnline", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("reflects navigator.onLine", () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
  });

  it("updates on offline/online events and cleans up", () => {
    const { result, unmount } = renderHook(() => useOnline());
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(result.current).toBe(false);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(result.current).toBe(true);
    unmount();
  });

  it("assumes online without a navigator", () => {
    Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true });
    try {
      const { result, unmount } = renderHook(() => useOnline());
      expect(result.current).toBe(true);
      unmount();
    } finally {
      Object.defineProperty(globalThis, "navigator", { value: realNavigator, configurable: true });
    }
  });
});
