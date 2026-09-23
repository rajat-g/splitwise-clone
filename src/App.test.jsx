import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseConvexAuth = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useQuery: (...args) => mockUseQuery(...args),
  useMutation: () => vi.fn(),
  useConvex: () => ({}),
  useConvexAuth: (...args) => mockUseConvexAuth(...args),
  ConvexReactClient: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: vi.fn(), signOut: vi.fn() }),
  ConvexAuthProvider: ({ children }) => children,
}));

import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

beforeEach(() => {
  localStorage.clear();
  mockUseQuery.mockReset().mockReturnValue(undefined);
  mockUseConvexAuth.mockReset().mockReturnValue({ isAuthenticated: false, isLoading: false });
});

describe("App", () => {
  it("renders the landing page with layout", () => {
    render(<App />);
    expect(screen.getByLabelText("FairSplit home")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /split bills with friends/i })).toBeInTheDocument();
  });

  it("navigates to create and join pages", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: /create a group/i }));
    expect(screen.getByText(/sign in to create a group/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /^join$/i }));
    expect(screen.getByText(/join with an invite/i)).toBeInTheDocument();
  });

  it("redirects unknown routes home", () => {
    window.history.pushState({}, "", "/nope");
    render(<App />);
    expect(screen.getByRole("heading", { name: /split bills with friends/i })).toBeInTheDocument();
    window.history.pushState({}, "", "/");
  });
});
