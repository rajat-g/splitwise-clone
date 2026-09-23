import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseConvexAuth = vi.hoisted(() => vi.fn());
const mockSignIn = vi.hoisted(() => vi.fn());
const mockSignOut = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useQuery: (...args) => mockUseQuery(...args),
  useMutation: () => vi.fn(),
  useConvex: () => ({}),
  useConvexAuth: (...args) => mockUseConvexAuth(...args),
  ConvexReactClient: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: mockSignIn, signOut: mockSignOut }),
  ConvexAuthProvider: ({ children }) => children,
}));

import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import Layout from "./Layout";

beforeEach(() => {
  localStorage.clear();
  mockUseQuery.mockReset().mockReturnValue(undefined);
  mockUseConvexAuth.mockReset().mockReturnValue({ isAuthenticated: false, isLoading: false });
  document.documentElement.classList.remove("dark");
});

function renderLayout(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout>
        <p>Child page</p>
      </Layout>
    </MemoryRouter>
  );
}

describe("Layout", () => {
  it("renders brand, nav and footer with guest hint", () => {
    renderLayout();
    expect(screen.getByLabelText("FairSplit home")).toBeInTheDocument();
    expect(screen.getByText("Child page")).toBeInTheDocument();
    expect(screen.getByText("Guests view free")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create group" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Back to home")).not.toBeInTheDocument();
  });

  it("shows a back link off-home and the guest display name", () => {
    localStorage.setItem("splitwise-clone:displayName", "Priya");
    renderLayout("/join");
    expect(screen.getByLabelText("Back to home")).toBeInTheDocument();
    expect(screen.getByText("Priya")).toBeInTheDocument();
  });

  it("toggles the theme and persists it", () => {
    renderLayout();
    const btn = screen.getByRole("button", { name: /switch to dark mode/i });
    fireEvent.click(btn);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("fairsplit:theme")).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("opens the auth dialog for guests", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
  });
});
