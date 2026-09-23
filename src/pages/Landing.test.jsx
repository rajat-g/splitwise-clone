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

import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import Landing from "./Landing";

beforeEach(() => {
  localStorage.clear();
  mockUseQuery.mockReset().mockReturnValue(undefined);
  mockUseConvexAuth.mockReset().mockReturnValue({ isAuthenticated: false, isLoading: false });
});

describe("Landing", () => {
  it("renders hero, steps and setup banner without backend URL", () => {
    vi.stubEnv("VITE_CONVEX_URL", "");
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByText(/split bills with friends/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a group/i })).toBeInTheDocument();
    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(screen.getByText("Why groups trust it")).toBeInTheDocument();
    expect(screen.getByText(/connect convex/i)).toBeInTheDocument();
    vi.unstubAllEnvs();
  });
});
