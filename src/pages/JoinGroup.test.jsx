import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useQuery: (...args) => mockUseQuery(...args),
  useMutation: () => vi.fn(),
  useConvex: () => ({}),
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
  ConvexReactClient: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: vi.fn(), signOut: vi.fn() }),
  ConvexAuthProvider: ({ children }) => children,
}));

import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import JoinGroup from "./JoinGroup";

function LocationSpy() {
  const { pathname } = useLocation();
  return <p data-testid="path">{pathname}</p>;
}

beforeEach(() => {
  localStorage.clear();
  mockUseQuery.mockReset().mockImplementation((fn, args) => {
    if (args === "skip") return undefined;
    return { publicId: "resolved-id" };
  });
});

describe("JoinGroup", () => {
  function renderPage() {
    return render(
      <MemoryRouter>
        <JoinGroup />
        <Routes>
          <Route path="*" element={<LocationSpy />} />
        </Routes>
      </MemoryRouter>
    );
  }

  function path() {
    return screen.getByTestId("path").textContent;
  }

  it("requires an invite value", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /open group/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/invite link or invite code/i);
  });

  it("opens full invite links directly", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/invite link or code/i), {
      target: { value: "https://x.test/g/ABCDEF123456789012345" },
    });
    fireEvent.click(screen.getByRole("button", { name: /open group/i }));
    expect(path()).toBe("/g/ABCDEF123456789012345");
  });

  it("opens raw 21-char ids directly", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/invite link or code/i), {
      target: { value: "A".repeat(21) },
    });
    fireEvent.click(screen.getByRole("button", { name: /open group/i }));
    expect(path()).toBe(`/g/${"A".repeat(21)}`);
  });

  it("resolves 10-character codes via the backend", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/invite link or code/i), { target: { value: "kx7q-9m2p-ab" } });
    fireEvent.click(screen.getByRole("button", { name: /open group/i }));
    expect(path()).toBe("/g/resolved-id");
  });

  it("rejects malformed codes and remembers the display name", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/invite link or code/i), { target: { value: "abc" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Priya"), { target: { value: "Priya" } });
    fireEvent.click(screen.getByRole("button", { name: /open group/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/10 characters/i);
    expect(localStorage.getItem("splitwise-clone:displayName")).toBe("Priya");
  });

  it("reports unknown codes", () => {
    mockUseQuery.mockImplementation((fn, args) => (args === "skip" ? undefined : null));
    renderPage();
    fireEvent.change(screen.getByLabelText(/invite link or code/i), { target: { value: "ZZZZZZZZZZ" } });
    fireEvent.click(screen.getByRole("button", { name: /open group/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/not found/i);
  });
});
