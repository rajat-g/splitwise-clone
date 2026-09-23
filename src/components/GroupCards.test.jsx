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

import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { MyGroups, RecentGroups } from "./GroupCards";
import { saveRecentGroup } from "../lib/identity";

function LocationSpy() {
  const { pathname } = useLocation();
  return <p data-testid="path">{pathname}</p>;
}

beforeEach(() => {
  localStorage.clear();
  mockUseQuery.mockReset().mockReturnValue(undefined);
  mockUseConvexAuth.mockReset().mockReturnValue({ isAuthenticated: true, isLoading: false });
});

function renderWithRouter(ui) {
  return render(
    <MemoryRouter>
      {ui}
      <Routes>
        <Route path="*" element={<LocationSpy />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MyGroups", () => {
  it("returns null for guests", () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    renderWithRouter(<MyGroups />);
    expect(screen.queryByText("My groups")).not.toBeInTheDocument();
  });

  it("shows a loader, then nothing when empty", () => {
    const { unmount } = renderWithRouter(<MyGroups />);
    expect(screen.getByText(/loading groups/i)).toBeInTheDocument();
    unmount();
    mockUseQuery.mockReturnValue([]);
    renderWithRouter(<MyGroups />);
    expect(screen.queryByText("My groups")).not.toBeInTheDocument();
  });

  it("lists groups and navigates on click", () => {
    mockUseQuery.mockReturnValue([
      { publicId: "abc", name: "Goa", inviteCode: "KX7Q9M2PAB" },
    ]);
    renderWithRouter(<MyGroups />);
    expect(screen.getByText("Goa")).toBeInTheDocument();
    expect(screen.getByText("KX7Q-9M2P-AB")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /goa/i }));
    expect(screen.getByTestId("path")).toHaveTextContent("/g/abc");
  });
});

describe("RecentGroups", () => {
  it("returns null without recents and lists them otherwise", () => {
    const first = renderWithRouter(<RecentGroups />);
    expect(screen.queryByText(/pick up where/i)).not.toBeInTheDocument();
    first.unmount();

    saveRecentGroup({ id: "g1", name: "Goa", inviteCode: "KX7Q9M2PAB" });
    saveRecentGroup({ id: "g2", name: "Flat" });
    const r2 = renderWithRouter(<RecentGroups />);
    expect(r2.getByText("Goa")).toBeInTheDocument();
    expect(r2.getByText("Flat")).toBeInTheDocument();
    fireEvent.click(r2.getByRole("button", { name: /flat/i }));
    expect(r2.getByTestId("path")).toHaveTextContent("/g/g2");
  });
});
