import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OutboxBar } from "./OutboxBar";

const addOp = (over = {}) => ({
  opId: "op-1", groupPublicId: "g", kind: "add", tempId: "tmp-1",
  entry: { description: "Dinner", isSettlement: false },
  status: "pending", error: "", userId: "u1", ...over,
});

describe("OutboxBar", () => {
  it("renders nothing without items", () => {
    const { container } = render(
      <OutboxBar items={[]} online syncing={false} onSync={() => {}} onRetry={() => {}} onDiscard={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows pending count and syncs", () => {
    const onSync = vi.fn();
    render(
      <OutboxBar items={[addOp(), addOp({ opId: "op-2" })]} userId="u1" online={false} syncing={false}
        onSync={onSync} onRetry={() => {}} onDiscard={() => {}} />
    );
    expect(screen.getByText(/2 changes/)).toBeInTheDocument();
    expect(screen.getByText(/you're offline/)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /offline/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onSync).not.toHaveBeenCalled();
  });

  it("shows syncing state when online", () => {
    const onSync = vi.fn();
    render(
      <OutboxBar items={[addOp()]} userId="u1" online syncing onSync={onSync} onRetry={() => {}} onDiscard={() => {}} />
    );
    expect(screen.getByText(/waiting to sync/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Syncing…" })).toBeDisabled();
  });

  it("lists failed ops with retry and discard", () => {
    const onRetry = vi.fn();
    const onDiscard = vi.fn();
    render(
      <OutboxBar
        items={[
          addOp({ opId: "f1", status: "failed", error: "boom" }),
          { opId: "f2", groupPublicId: "g", kind: "update", status: "failed", error: "", userId: "u1" },
          { opId: "f3", groupPublicId: "g", kind: "remove", status: "failed", error: "", userId: "u1" },
          { opId: "f4", groupPublicId: "g", kind: "add", entry: { description: "P", isSettlement: true }, status: "failed", error: "", userId: "u1" },
        ]}
        userId="u1" online syncing={false} onSync={() => {}} onRetry={onRetry} onDiscard={onDiscard}
      />
    );
    expect(screen.getByText(/couldn't sync/)).toBeInTheDocument();
    expect(screen.getByText(/Edit queued/)).toBeInTheDocument();
    expect(screen.getByText(/Delete queued/)).toBeInTheDocument();
    expect(screen.getByText(/Payment queued: P/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    expect(onRetry).toHaveBeenCalledWith("f1");
    fireEvent.click(screen.getAllByRole("button", { name: "Discard" })[0]);
    expect(onDiscard).toHaveBeenCalledWith("f1");
  });

  it("syncs pending ops when online", () => {
    const onSync = vi.fn();
    render(
      <OutboxBar items={[addOp()]} userId="u1" online syncing={false}
        onSync={onSync} onRetry={() => {}} onDiscard={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /sync now/i }));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("disables retry while offline", () => {
    render(
      <OutboxBar items={[addOp({ status: "failed", error: "x" })]} userId="u1" online={false} syncing={false}
        onSync={() => {}} onRetry={() => {}} onDiscard={() => {}} />
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
  });

  it("labels entries without a description", () => {
    render(
      <OutboxBar items={[{ opId: "e1", groupPublicId: "g", kind: "add", status: "failed", error: "", userId: "u1" }]}
        userId="u1" online syncing={false} onSync={() => {}} onRetry={() => {}} onDiscard={() => {}} />
    );
    expect(screen.getByText(/expense queued: expense/i)).toBeInTheDocument();
  });

  it("holds other accounts' ops untouched without actions", () => {
    const onSync = vi.fn();
    const onRetry = vi.fn();
    const onDiscard = vi.fn();
    render(
      <OutboxBar items={[addOp({ opId: "f", userId: "u2" })]} userId="u1"
        online syncing={false} onSync={onSync} onRetry={onRetry} onDiscard={onDiscard} />
    );
    expect(screen.getByText(/belong to another account/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sync now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
  });

  it("mixes my pending ops with a foreign notice", () => {
    const onSync = vi.fn();
    render(
      <OutboxBar items={[addOp(), addOp({ opId: "f", userId: "u2" })]} userId="u1"
        online syncing={false} onSync={onSync} onRetry={() => {}} onDiscard={() => {}} />
    );
    expect(screen.getByText(/waiting to sync/)).toBeInTheDocument();
    expect(screen.getByText(/different signed-in account/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sync now/i }));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("offers adopt-or-discard recovery for unstamped orphans", () => {
    const onAdopt = vi.fn();
    const onDiscard = vi.fn();
    const orphan = { opId: "o1", groupPublicId: "g", kind: "add", tempId: "tmp-1",
      entry: { description: "Old", isSettlement: false }, status: "failed", error: "denied" };
    render(
      <OutboxBar items={[orphan]} userId="u1"
        online syncing={false} onSync={() => {}} onRetry={() => {}} onDiscard={onDiscard} onAdopt={onAdopt} />
    );
    expect(screen.getByText(/pre-tracking queue/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adopt" }));
    expect(onAdopt).toHaveBeenCalledWith("o1");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledWith("o1");
  });

  it("hides adopt from guests but keeps discard", () => {
    render(
      <OutboxBar items={[{ opId: "o1", groupPublicId: "g", kind: "add", status: "pending", error: "" }]}
        online syncing={false} onSync={() => {}} onRetry={() => {}} onDiscard={() => {}} onAdopt={() => {}} />
    );
    expect(screen.queryByRole("button", { name: "Adopt" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });
});
