import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseMutation = vi.hoisted(() => vi.fn());
const mockUseConvexAuth = vi.hoisted(() => vi.fn());
const mockUseConvex = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useQuery: (...args) => mockUseQuery(...args),
  useMutation: (...args) => mockUseMutation(...args),
  useConvex: (...args) => mockUseConvex(...args),
  useConvexAuth: (...args) => mockUseConvexAuth(...args),
  ConvexReactClient: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: vi.fn(), signOut: vi.fn() }),
  ConvexAuthProvider: ({ children }) => children,
}));

import { MemoryRouter, Route, Routes } from "react-router-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { dropOp, enqueueAdd, getOutbox } from "../lib/offline";
import GroupPage from "./GroupPage";

function fname(ref) {
  try {
    return getFunctionName(ref);
  } catch {
    return "";
  }
}

const NOW = Date.now();
const group = { _id: "g1", publicId: "abc", name: "Goa", currency: "$", inviteCode: "KX7Q9M2PAB", ownerUserId: "u1" };
const members = [
  { _id: "m1", name: "Ada", email: "ada@x.co", userId: "u1", createdAt: NOW - 5000 },
  { _id: "m2", name: "bo@x.co", email: "bo@x.co", createdAt: NOW - 4000 },
  { _id: "m3", name: "Cy", email: "cy@x.co", userId: "u3", createdAt: NOW - 3000 },
];
const expenses = [
  {
    _id: "e1", description: "Dinner", amountCents: 10000, paidBy: "m1", date: "2026-09-20",
    category: "food", splitMode: "equal", isSettlement: false, createdByName: "Ada",
    splits: [
      { memberId: "m1", amountCents: 5000 },
      { memberId: "m2", amountCents: 5000 },
    ],
  },
  {
    _id: "e2", description: "Payment: Bo → Ada", amountCents: 2000, paidBy: "m2", date: "2026-09-21",
    isSettlement: true, createdByName: "Bo",
    splits: [{ memberId: "m1", amountCents: 2000 }],
  },
];
const activity = [{ _id: "a1", type: "expense_added", text: "Ada added dinner", actorName: "Ada", createdAt: NOW - 100 }];

const mutations = {};
beforeEach(() => {
  localStorage.clear();
  for (const op of getOutbox()) dropOp(op.opId);
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  window.confirm = vi.fn(() => true);
  for (const k of Object.keys(mutations)) delete mutations[k];
  for (const name of ["addMember", "renameMember", "removeMember", "addExpense", "updateExpense", "deleteExpense", "rotateCode", "claimInvite", "joinGroup"]) {
    mutations[name] = vi.fn().mockResolvedValue({});
  }
  mockUseConvexAuth.mockReset().mockReturnValue({ isAuthenticated: false, isLoading: false });
  mockUseConvex.mockReset().mockReturnValue({});
  mockUseMutation.mockReset().mockImplementation((ref) => {
    switch (fname(ref)) {
      case "members:add": return mutations.addMember;
      case "members:rename": return mutations.renameMember;
      case "members:remove": return mutations.removeMember;
      case "members:join": return mutations.joinGroup;
      case "expenses:add": return mutations.addExpense;
      case "expenses:update": return mutations.updateExpense;
      case "expenses:remove": return mutations.deleteExpense;
      case "groups:rotateCode": return mutations.rotateCode;
      case "members:claim": return mutations.claimInvite;
      default: return vi.fn();
    }
  });
  mockUseQuery.mockReset().mockImplementation((ref) => {
    switch (fname(ref)) {
      case "groups:getByPublicId": return group;
      case "members:list": return members;
      case "expenses:list": return expenses;
      case "expenses:activity": return activity;
      case "users:viewer": return null;
      default: return undefined;
    }
  });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/g/abc"]}>
      <Routes>
        <Route path="/g/:id" element={<GroupPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// Tabs order: Expenses, Balances, Debts, Summary, Insights, Members, Activity.
function tab(i) {
  return screen.getAllByRole("tab")[i];
}

describe("GroupPage loading and missing states", () => {
  it("shows skeletons while loading", () => {
    mockUseQuery.mockReturnValue(undefined);
    renderPage();
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });

  it("explains an unknown group", () => {
    mockUseQuery.mockImplementation((ref) => {
      if (fname(ref) === "groups:getByPublicId") return null;
      return [];
    });
    renderPage();
    expect(screen.getByText(/didn't open/i)).toBeInTheDocument();
  });
});

describe("GroupPage as guest", () => {
  it("renders header, expenses and guest banner", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Goa" })).toBeInTheDocument();
    expect(screen.getByText(/viewing as a guest/i)).toBeInTheDocument();
    expect(screen.getByText("Dinner")).toBeInTheDocument();
    expect(screen.getAllByText("Food & Drinks")).toHaveLength(2); // list badge + filter option
    fireEvent.click(screen.getByRole("button", { name: /sign in to add$/i }));
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
  });

  it("switches through balances, debts, summary, members and activity tabs", async () => {
    renderPage();
    fireEvent.click(tab(1));
    expect(screen.getByText(/net total/i)).toBeInTheDocument();
    expect(screen.getByText(/gets \$30\.00/)).toBeInTheDocument();

    fireEvent.click(tab(2));
    expect(screen.getByText("Simplified debts")).toBeInTheDocument();
    expect(screen.getByText(/moves \$30\.00 in total/)).toBeInTheDocument();

    fireEvent.click(tab(3));
    expect(screen.getByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(screen.getAllByText("Total").length).toBeGreaterThanOrEqual(3);

    fireEvent.click(tab(5));
    expect(screen.getByText(/invited/)).toBeInTheDocument();
    expect(screen.getByText(/sign in to add members/i)).toBeInTheDocument();

    fireEvent.click(tab(6));
    expect(screen.getByText("Ada added dinner")).toBeInTheDocument();

    fireEvent.click(tab(4));
    // Lazy-loaded recharts transform can be slow under parallel load.
    await waitFor(() => expect(screen.getByText("Top category")).toBeInTheDocument(), { timeout: 10000 });
  });

  it("filters expenses by category", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/filter expenses by category/i), { target: { value: "food" } });
    expect(screen.getByText("Dinner")).toBeInTheDocument();
    expect(screen.queryByText(/Payment: Bo/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/filter expenses by category/i), { target: { value: "travel" } });
    expect(screen.getByText(/no travel expenses yet/i)).toBeInTheDocument();
  });
});

describe("GroupPage members as a signed-in user", () => {
  beforeEach(() => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockImplementation((ref) => {
      switch (fname(ref)) {
        case "groups:getByPublicId": return group;
        case "members:list": return members;
        case "expenses:list": return expenses;
        case "expenses:activity": return activity;
        case "users:viewer": return { _id: "u1", name: "Ada", email: "ada@x.co" };
        default: return undefined;
      }
    });
  });

  it("claims a matching invite and marks you", async () => {
    mockUseQuery.mockImplementation((ref) => {
      switch (fname(ref)) {
        case "groups:getByPublicId": return group;
        case "members:list": return members;
        case "expenses:list": return expenses;
        case "expenses:activity": return activity;
        case "users:viewer": return { _id: "u2", name: "Bo", email: "bo@x.co" };
        default: return undefined;
      }
    });
    renderPage();
    await waitFor(() => expect(mutations.claimInvite).toHaveBeenCalledWith({ publicId: "abc" }));
    fireEvent.click(tab(5));
    expect(screen.getByText("you")).toBeInTheDocument();
  });

  it("invites by email with validation", async () => {
    renderPage();
    fireEvent.click(tab(5));
    fireEvent.change(screen.getByLabelText(/new member email/i), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(mutations.addMember).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/new member email/i), { target: { value: "new@x.co" } });
    fireEvent.change(screen.getByLabelText(/temp display name/i), { target: { value: "New" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(mutations.addMember).toHaveBeenCalledWith(
      expect.objectContaining({ publicId: "abc", email: "new@x.co", name: "New" })
    ));
  });

  it("refuses member changes while offline", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    renderPage();
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
    fireEvent.click(tab(5));
    fireEvent.change(screen.getByLabelText(/new member email/i), { target: { value: "n@x.co" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(screen.getByText(/adding members needs a connection/i)).toBeInTheDocument();
  });

  it("renames, cancels and removes members", async () => {
    renderPage();
    fireEvent.click(tab(5));
    fireEvent.click(screen.getByRole("button", { name: "Rename Cy" }));
    fireEvent.change(screen.getByLabelText("Rename Cy"), { target: { value: "Cyril" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mutations.renameMember).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: "m3", name: "Cyril" })
    ));

    // Ada is the viewer ("Leave"); Bo is locked; Cy is removable.
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    expect(removeButtons).toHaveLength(2);
    expect(removeButtons[0]).toBeDisabled();
    fireEvent.click(removeButtons[1]);
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(mutations.removeMember).toHaveBeenCalled());
  });

  it("rejects blank names on rename", async () => {
    renderPage();
    fireEvent.click(tab(5));
    fireEvent.click(screen.getByRole("button", { name: "Rename Cy" }));
    fireEvent.change(screen.getByLabelText("Rename Cy"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/enter a name first/i)).toBeInTheDocument();
    expect(mutations.renameMember).not.toHaveBeenCalled();
  });
});

describe("GroupPage edge paths", () => {
  const adaViewer = { _id: "u1", name: "Ada", email: "ada@x.co" };
  function mockAuthed(viewer = adaViewer, over = {}) {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockImplementation((ref) => {
      switch (fname(ref)) {
        case "groups:getByPublicId": return over.group ?? group;
        case "members:list": return over.members ?? members;
        case "expenses:list": return over.expenses ?? expenses;
        case "expenses:activity": return over.activity ?? activity;
        case "users:viewer": return viewer;
        default: return undefined;
      }
    });
  }
  const entry = {
    description: "Queued", amountCents: 100, paidBy: "m1",
    splits: [{ memberId: "m1", amountCents: 100 }],
    date: "2026-09-20", isSettlement: false,
  };

  it("renders relative times across ranges", () => {
    const olds = [5 * 60e3, 3 * 3600e3, 3 * 86400e3, 30 * 86400e3].map((ago, i) => ({
      _id: `old${i}`, type: "x", text: `Old ${i}`, actorName: "Ada", createdAt: NOW - ago,
    }));
    mockAuthed(adaViewer, { activity: [...activity, ...olds] });
    renderPage();
    fireEvent.click(tab(6));
    expect(screen.getByText("5m ago")).toBeInTheDocument();
    expect(screen.getByText("3h ago")).toBeInTheDocument();
    expect(screen.getByText("3d ago")).toBeInTheDocument();
    expect(screen.getByText(new Date(NOW - 30 * 86400e3).toLocaleDateString())).toBeInTheDocument();
  });

  it("allows the same display name across distinct emails on rename", async () => {
    mockAuthed();
    renderPage();
    fireEvent.click(tab(5));
    fireEvent.click(screen.getByRole("button", { name: "Rename Cy" }));
    fireEvent.change(screen.getByLabelText("Rename Cy"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mutations.renameMember).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: "m3", name: "Ada" })
    ));
  });

  it("auto-syncs failures and handles retry and discard", async () => {
    mockAuthed();
    enqueueAdd("abc", entry);
    renderPage();
    await waitFor(() => expect(screen.getByText(/couldn't sync/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /sync now/i }));
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    await waitFor(() => expect(screen.getByText(/couldn't sync/)).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: "Discard" })[0]);
    await waitFor(() => expect(screen.queryByText(/couldn't sync/)).not.toBeInTheDocument());
  });

  it("disables code rotation for guests", () => {
    renderPage();
    const btn = screen.getByRole("button", { name: /new code/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", expect.stringMatching(/only the group owner/i));
  });

  it("disables code rotation for non-owner members", () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockImplementation((ref) => {
      switch (fname(ref)) {
        case "groups:getByPublicId": return group;
        case "members:list": return members;
        case "expenses:list": return expenses;
        case "expenses:activity": return activity;
        case "users:viewer": return { _id: "u3", name: "Cy", email: "cy@x.co" };
        default: return undefined;
      }
    });
    renderPage();
    expect(screen.getByRole("button", { name: /new code/i })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Add expense" }).length).toBeGreaterThan(0);
  });

  it("prompts signed-in outsiders to join and lets them in", async () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockImplementation((ref) => {
      switch (fname(ref)) {
        case "groups:getByPublicId": return group;
        case "members:list": return members;
        case "expenses:list": return expenses;
        case "expenses:activity": return activity;
        case "users:viewer": return { _id: "u9", name: "Stranger", email: "s@x.co" };
        default: return undefined;
      }
    });
    renderPage();
    expect(screen.getByText(/not a member of this group yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Join this group" }));
    await waitFor(() => expect(mutations.joinGroup).toHaveBeenCalledWith(
      expect.objectContaining({ publicId: "abc" })
    ));

    fireEvent.click(tab(5));
    fireEvent.click(screen.getByRole("button", { name: /join this group to invite members/i }));
    expect(mutations.joinGroup).toHaveBeenCalledTimes(2);
  });

  it("blocks joining while offline and surfaces join failures", async () => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockImplementation((ref) => {
      switch (fname(ref)) {
        case "groups:getByPublicId": return group;
        case "members:list": return members;
        case "expenses:list": return expenses;
        case "expenses:activity": return activity;
        case "users:viewer": return { _id: "u9", name: "Stranger", email: "s@x.co" };
        default: return undefined;
      }
    });
    mutations.joinGroup.mockRejectedValueOnce(new Error("Join denied"));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Join to add" }));
    await waitFor(() => expect(screen.getByText("Join denied")).toBeInTheDocument());

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    act(() => { window.dispatchEvent(new Event("offline")); });
    fireEvent.click(screen.getByRole("button", { name: "Join to add" }));
    expect(screen.getByText(/joining needs a connection/i)).toBeInTheDocument();
  });

  it("shows the offline notice without a snapshot", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockUseQuery.mockReturnValue(undefined);
    renderPage();
    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
  });

  it("shows the missing-group card for a groupless snapshot", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockUseQuery.mockReturnValue(undefined);
    localStorage.setItem("fairsplit:snap:v1:abc", JSON.stringify({
      savedAt: 1, members: [], expenses: [], activity: [],
    }));
    renderPage();
    expect(screen.getByText(/didn't open/i)).toBeInTheDocument();
  });

  it("queues settlements and deletes while offline", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockAuthed();
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Settle up" })[0]);
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByPlaceholderText("0.00"), { target: { value: "5" } });
    fireEvent.click(dialog.getByRole("button", { name: /record payment/i }));
    expect(getOutbox()).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Dinner" }));
    expect(mutations.deleteExpense).not.toHaveBeenCalled();
    expect(getOutbox()).toHaveLength(2);
  });

  it("blocks member and code changes while offline", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    mockAuthed();
    renderPage();
    fireEvent.click(tab(5));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    expect(screen.getByText(/removing members needs a connection/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rename Cy" }));
    fireEvent.change(screen.getByLabelText("Rename Cy"), { target: { value: "Cyril" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/renaming needs a connection/i)).toBeInTheDocument();
    expect(mutations.renameMember).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /new code/i }));
    expect(screen.getByText(/rotating the invite code needs a connection/i)).toBeInTheDocument();
  });

  it("surfaces backend failures for invites and renames", async () => {
    mockAuthed();
    mutations.addMember.mockRejectedValueOnce(new Error("Nope"));
    mutations.renameMember.mockRejectedValueOnce(new Error("Taken"));
    renderPage();
    fireEvent.click(tab(5));
    fireEvent.change(screen.getByLabelText(/new member email/i), { target: { value: "n@x.co" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(screen.getByText("Nope")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Rename Cy" }));
    fireEvent.change(screen.getByLabelText("Rename Cy"), { target: { value: "Cyril" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Taken")).toBeInTheDocument());
  });

  it("falls back to execCommand when clipboard write fails", async () => {
    mockAuthed();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    });
    document.execCommand = vi.fn(() => true);
    window.HTMLTextAreaElement.prototype.select =
      window.HTMLTextAreaElement.prototype.select || vi.fn();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /copy invite link/i }));
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("opens the modal from empty and filtered-empty states", () => {
    mockAuthed(adaViewer, { expenses: [] });
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Add expense" })[1]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("settles from member rows and the debts tab", async () => {
    mockAuthed();
    renderPage();
    fireEvent.click(tab(5));
    fireEvent.click(screen.getByTitle("Settle up with bo@x.co"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(tab(2));
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Settle" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("saves renames on Enter and cancels on Escape", async () => {
    mockAuthed();
    renderPage();
    fireEvent.click(tab(5));
    fireEvent.click(screen.getByRole("button", { name: "Rename Cy" }));
    fireEvent.keyDown(screen.getByLabelText("Rename Cy"), { key: "Enter" });
    await waitFor(() => expect(mutations.renameMember).toHaveBeenCalled());

    fireEvent.keyDown(screen.getByLabelText("Rename Cy"), { key: "Escape" });
    expect(screen.queryByDisplayValue("Cy")).not.toBeInTheDocument();
  });

  it("opens modals from the mobile action bar", () => {
    mockAuthed();
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Add expense" })[1]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Settle up" })[1]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a null balance without a matching member", () => {
    mockAuthed({ _id: "u9", name: "Stranger", email: "s@x.co" });
    renderPage();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("no matching member yet")).toBeInTheDocument();
  });

  it("respects cancelled confirmations", () => {
    mockAuthed();
    window.confirm = vi.fn(() => false);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Delete Dinner" }));
    expect(mutations.deleteExpense).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /new code/i }));
    expect(mutations.rotateCode).not.toHaveBeenCalled();
  });

  it("surfaces save failures for adds and edits", async () => {
    mockAuthed();
    mutations.addExpense.mockRejectedValueOnce(new Error("Save failed"));
    mutations.updateExpense.mockRejectedValueOnce(new Error("Edit failed"));
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Add expense" })[0]);
    let dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByPlaceholderText(/dinner, taxi/i), { target: { value: "X" } });
    fireEvent.change(dialog.getByPlaceholderText("0.00"), { target: { value: "9" } });
    fireEvent.click(dialog.getByRole("button", { name: /^add expense$/i }));
    await waitFor(() => expect(screen.getByText("Save failed")).toBeInTheDocument());
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
    dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(screen.getByText("Edit failed")).toBeInTheDocument());
  });

  it("tolerates a failing claim", async () => {
    mutations.claimInvite.mockRejectedValueOnce(new Error("gone"));
    mockAuthed({ _id: "u2", name: "Bo", email: "bo@x.co" });
    renderPage();
    await waitFor(() => expect(mutations.claimInvite).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Goa" })).toBeInTheDocument();
  });

  it("never auto-syncs another account's queued ops", async () => {
    mockAuthed();
    enqueueAdd("abc", entry, "u-other");
    renderPage();
    await waitFor(() => expect(screen.getByText(/belong to another account/i)).toBeInTheDocument());
    expect(mutations.addExpense).not.toHaveBeenCalled();
    expect(getOutbox()).toHaveLength(1);
  });
});

describe("GroupPage expenses as a signed-in user", () => {
  beforeEach(() => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    mockUseQuery.mockImplementation((ref) => {
      switch (fname(ref)) {
        case "groups:getByPublicId": return group;
        case "members:list": return members;
        case "expenses:list": return expenses;
        case "expenses:activity": return activity;
        case "users:viewer": return { _id: "u1", name: "Ada", email: "ada@x.co" };
        default: return undefined;
      }
    });
  });

  function openAddExpense() {
    fireEvent.click(screen.getAllByRole("button", { name: "Add expense" })[0]);
    return within(screen.getByRole("dialog"));
  }

  it("adds an expense through the modal", async () => {
    renderPage();
    const dialog = openAddExpense();
    fireEvent.change(dialog.getByPlaceholderText(/dinner, taxi/i), { target: { value: "Lunch" } });
    fireEvent.change(dialog.getByPlaceholderText("0.00"), { target: { value: "60" } });
    fireEvent.click(dialog.getByRole("button", { name: /^add expense$/i }));
    await waitFor(() => expect(mutations.addExpense).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Lunch", isSettlement: false })
    ));
  });

  it("edits and deletes expenses", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Edit Dinner" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(mutations.updateExpense).toHaveBeenCalledWith(
      expect.objectContaining({ expenseId: "e1" })
    ));

    fireEvent.click(screen.getByRole("button", { name: "Delete Dinner" }));
    await waitFor(() => expect(mutations.deleteExpense).toHaveBeenCalledWith(
      expect.objectContaining({ expenseId: "e1" })
    ));
  });

  it("records a settlement", async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "Settle up" })[0]);
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByPlaceholderText("0.00"), { target: { value: "25" } });
    fireEvent.click(dialog.getByRole("button", { name: /record payment/i }));
    await waitFor(() => expect(mutations.addExpense).toHaveBeenCalledWith(
      expect.objectContaining({ isSettlement: true })
    ));
  });

  it("queues expenses while offline", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    renderPage();
    const dialog = openAddExpense();
    fireEvent.change(dialog.getByPlaceholderText(/dinner, taxi/i), { target: { value: "Cached" } });
    fireEvent.change(dialog.getByPlaceholderText("0.00"), { target: { value: "10" } });
    fireEvent.click(dialog.getByRole("button", { name: /^add expense$/i }));
    expect(mutations.addExpense).not.toHaveBeenCalled();
    expect(getOutbox()).toHaveLength(1);
    expect(screen.getByText("queued")).toBeInTheDocument();
  });

  it("copies the invite link, rotates the code and exports csv", async () => {
    const createEl = document.createElement.bind(document);
    const anchors = [];
    document.createElement = ((tag) => {
      const el = createEl(tag);
      if (tag === "a") anchors.push(el);
      return el;
    });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    try {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /copy invite link/i }));
      await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());

      fireEvent.click(screen.getByTitle(/download all expenses as csv/i));
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(anchors).toHaveLength(1);

      fireEvent.click(screen.getByRole("button", { name: /rotate code|new code/i }));
      await waitFor(() => expect(mutations.rotateCode).toHaveBeenCalledWith({ publicId: "abc" }));
    } finally {
      document.createElement = createEl;
    }
  });
});
