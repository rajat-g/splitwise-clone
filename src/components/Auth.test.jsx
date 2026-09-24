import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseConvex = vi.hoisted(() => vi.fn());
const mockUseConvexAuth = vi.hoisted(() => vi.fn());
const mockSignIn = vi.hoisted(() => vi.fn());
const mockSignOut = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useQuery: (...args) => mockUseQuery(...args),
  useMutation: () => vi.fn(),
  useConvex: (...args) => mockUseConvex(...args),
  useConvexAuth: (...args) => mockUseConvexAuth(...args),
  ConvexReactClient: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: mockSignIn, signOut: mockSignOut }),
  ConvexAuthProvider: ({ children }) => children,
}));

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { dropOp, enqueueAdd, getOutbox } from "../lib/offline";
import { AccountButton, AuthDialog } from "./Auth";

beforeEach(() => {
  localStorage.clear();
  for (const op of getOutbox()) dropOp(op.opId);
  mockUseQuery.mockReset().mockReturnValue(undefined);
  mockUseConvex.mockReset().mockReturnValue({});
  mockUseConvexAuth.mockReset().mockReturnValue({ isAuthenticated: false, isLoading: false });
  mockSignIn.mockReset().mockResolvedValue(undefined);
  mockSignOut.mockReset().mockResolvedValue(undefined);
  window.confirm = vi.fn(() => true);
});

function fillSignup() {
  fireEvent.change(screen.getByPlaceholderText("e.g. Priya"), { target: { value: "Priya" } });
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "p@x.co" } });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "password1" } });
}

describe("AuthDialog", () => {
  it("validates name, email and password", async () => {
    const onClose = vi.fn();
    render(<AuthDialog onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    fireEvent.click(screen.getByRole("button", { name: /^create free account$/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/your name/i);

    fillSignup();
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /^create free account$/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/8 characters/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("signs up and closes", async () => {
    const onClose = vi.fn();
    render(<AuthDialog onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    fillSignup();
    fireEvent.click(screen.getByRole("button", { name: /^create free account$/i }));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
    const [, form] = mockSignIn.mock.calls[0];
    expect(form.get("flow")).toBe("signUp");
    expect(form.get("name")).toBe("Priya");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("signs in and surfaces backend errors kindly", async () => {
    mockSignIn.mockRejectedValueOnce(new Error("[CONVEX A(auth:signIn)] InvalidSecret Called by client"));
    const onClose = vi.fn();
    render(<AuthDialog onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "p@x.co" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/incorrect email or password/i));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("maps every friendly backend error", async () => {
    const cases = [
      ["an account already exists", /already exists\. try signing in/i],
      ["INVALID CREDENTIALS", /didn't match/i],
      ["need at least 8 chars", /8 characters/i],
      ["a valid email is needed", /valid email address/i],
      ["", /something went wrong/i],
    ];
    for (const [raw, rx] of cases) {
      mockSignIn.mockRejectedValueOnce(new Error(raw));
      const onClose = vi.fn();
      const r = render(<AuthDialog onClose={onClose} />);
      fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "p@x.co" } });
      fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "password1" } });
      fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(rx));
      r.unmount();
    }
    mockSignIn.mockRejectedValueOnce({ data: "Custom backend failure" });
    const r = render(<AuthDialog onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "p@x.co" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/custom backend failure/i));
    r.unmount();
  });

  it("toggles back to sign-in", () => {
    render(<AuthDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(screen.getByText("Create your account")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
  });
});

describe("AccountButton", () => {
  it("shows a loader, a sign-in button, and the account menu", async () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
    const { unmount } = render(<AccountButton onSignIn={() => {}} />);
    expect(screen.getByLabelText("Checking session")).toBeInTheDocument();
    unmount();

    mockUseConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    const onSignIn = vi.fn();
    const r2 = render(<AccountButton onSignIn={onSignIn} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignIn).toHaveBeenCalled();
    r2.unmount();

    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockReturnValue({ name: "Priya", email: "p@x.co" });
    render(<AccountButton onSignIn={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /priya/i }));
    expect(screen.getByText("p@x.co")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it("falls back to the email prefix without a name", () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockReturnValue({ name: null, email: "bo@example.com" });
    render(<AccountButton onSignIn={() => {}} />);
    expect(screen.getByRole("button", { name: /bo/i })).toBeInTheDocument();
  });

  it("closes the menu on backdrop click", () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockReturnValue({ name: "Priya", email: "p@x.co" });
    const { container } = render(<AccountButton onSignIn={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /priya/i }));
    expect(screen.getByText("p@x.co")).toBeInTheDocument();
    fireEvent.click(container.querySelector(".fixed.inset-0.z-40"));
    expect(screen.queryByText("p@x.co")).not.toBeInTheDocument();
  });

  it("warns about unsynced changes when signing out offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockReturnValue({ _id: "u1", name: "Priya", email: "p@x.co" });
    enqueueAdd("g1", {
      description: "Dinner", amountCents: 100, paidBy: "m1",
      splits: [{ memberId: "m1", amountCents: 100 }], date: "2026-09-20", isSettlement: false,
    }, "u1");
    render(<AccountButton onSignIn={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /priya/i }));

    window.confirm = vi.fn(() => false);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/unsynced change/));
    expect(mockSignOut).not.toHaveBeenCalled();

    window.confirm = vi.fn(() => true);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("flushes my queue before signing out online", async () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockReturnValue({ _id: "u1", name: "Priya", email: "p@x.co" });
    mockUseConvex.mockReturnValue({ mutation: vi.fn(async () => ({ _id: "real-1" })) });
    enqueueAdd("g1", {
      description: "Dinner", amountCents: 100, paidBy: "m1",
      splits: [{ memberId: "m1", amountCents: 100 }], date: "2026-09-20", isSettlement: false,
    }, "u1");
    render(<AccountButton onSignIn={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /priya/i }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(getOutbox()).toHaveLength(0);
  });

  it("asks before abandoning ops that fail to flush", async () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockReturnValue({ _id: "u1", name: "Priya", email: "p@x.co" });
    mockUseConvex.mockReturnValue({ mutation: vi.fn(async () => { throw new Error("denied"); }) });
    enqueueAdd("g1", {
      description: "Dinner", amountCents: 100, paidBy: "m1",
      splits: [{ memberId: "m1", amountCents: 100 }], date: "2026-09-20", isSettlement: false,
    }, "u1");
    render(<AccountButton onSignIn={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /priya/i }));

    window.confirm = vi.fn(() => false);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/couldn't sync/)));
    expect(mockSignOut).not.toHaveBeenCalled();

    window.confirm = vi.fn(() => true);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it("leaves another account's queue alone on sign-out", async () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockReturnValue({ _id: "u1", name: "Priya", email: "p@x.co" });
    const mutation = vi.fn(async () => ({ _id: "real-1" }));
    mockUseConvex.mockReturnValue({ mutation });
    enqueueAdd("g1", {
      description: "Theirs", amountCents: 100, paidBy: "m9",
      splits: [{ memberId: "m9", amountCents: 100 }], date: "2026-09-20", isSettlement: false,
    }, "u2");
    render(<AccountButton onSignIn={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /priya/i }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mutation).not.toHaveBeenCalled();
    expect(getOutbox()).toHaveLength(1);
  });
});
