import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseMutation = vi.hoisted(() => vi.fn());
const mockUseConvexAuth = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useQuery: (...args) => mockUseQuery(...args),
  useMutation: (...args) => mockUseMutation(...args),
  useConvex: () => ({}),
  useConvexAuth: (...args) => mockUseConvexAuth(...args),
  ConvexReactClient: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: vi.fn(), signOut: vi.fn() }),
  ConvexAuthProvider: ({ children }) => children,
}));

import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CreateGroup from "./CreateGroup";

function LocationSpy() {
  const { pathname } = useLocation();
  return <p data-testid="path">{pathname}</p>;
}

beforeEach(() => {
  localStorage.clear();
  mockUseQuery.mockReset().mockReturnValue(undefined);
  mockUseMutation.mockReset().mockReturnValue(vi.fn());
  mockUseConvexAuth.mockReset().mockReturnValue({ isAuthenticated: true, isLoading: false });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateGroup />
      <Routes>
        <Route path="*" element={<LocationSpy />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CreateGroup", () => {
  it("shows a skeleton while auth loads", () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
    renderPage();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("asks guests to sign in", () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    renderPage();
    expect(screen.getByText(/sign in to create a group/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sign in \/ create account/i }));
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
  });

  it("validates name and group name", async () => {
    mockUseQuery.mockReturnValue(null);
    renderPage();
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Goa" } });
    fireEvent.click(screen.getByRole("button", { name: /create private group/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/your name first/i);

    fireEvent.click(screen.getByRole("button", { name: /use another name/i }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Priya"), { target: { value: "Priya" } });
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /create private group/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/give your group a name/i);
  });

  it("creates with a custom name and currency", async () => {
    const createGroup = vi.fn().mockResolvedValue({ publicId: "new-id", inviteCode: "CODE" });
    mockUseMutation.mockReturnValue(createGroup);
    mockUseQuery.mockReturnValue({ name: "Ada", email: "a@x.co" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /use another name/i }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Priya"), { target: { value: "Zed" } });
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "€" } });
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Goa Trip" } });
    fireEvent.click(screen.getByRole("button", { name: /create private group/i }));
    await waitFor(() => expect(createGroup).toHaveBeenCalledWith(expect.objectContaining({
      name: "Goa Trip",
      creatorName: "Zed",
      currency: "€",
    })));
    expect(localStorage.getItem("splitwise-clone:displayName")).toBe("Zed");
  });

  it("refuses while offline", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockUseQuery.mockReturnValue({ name: "Ada" });
    renderPage();
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Goa" } });
    fireEvent.click(screen.getByRole("button", { name: /create private group/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/you're offline/i);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("creates the group and navigates to it", async () => {
    const createGroup = vi.fn().mockResolvedValue({ publicId: "new-id", inviteCode: "CODE" });
    mockUseMutation.mockReturnValue(createGroup);
    mockUseQuery.mockReturnValue({ name: "Ada", email: "a@x.co" });
    renderPage();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Goa Trip" } });
    fireEvent.click(screen.getByRole("button", { name: /create private group/i }));
    await waitFor(() => expect(createGroup).toHaveBeenCalledWith(expect.objectContaining({
      name: "Goa Trip",
      creatorName: "Ada",
    })));
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/g/new-id"));
  });

  it("surfaces backend errors", async () => {
    const createGroup = vi.fn().mockRejectedValue(new Error("Taken"));
    mockUseMutation.mockReturnValue(createGroup);
    mockUseQuery.mockReturnValue({ name: "Ada" });
    renderPage();
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Goa" } });
    fireEvent.click(screen.getByRole("button", { name: /create private group/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Taken"));
  });

  it("adopts the account name when no local name exists", () => {
    mockUseQuery.mockReturnValue({ name: "Server Name" });
    renderPage();
    expect(screen.getByText("Server Name")).toBeInTheDocument();
  });
});
