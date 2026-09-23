import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DetailedSummary, SimplifiedDebts } from "./Summary";

const nameOf = (id) => ({ m1: "Ann", m2: "Bo" }[id] ?? "Unknown");

describe("SimplifiedDebts", () => {
  it("celebrates the settled state", () => {
    render(
      <SimplifiedDebts settlements={[]} currency="$" nameOf={nameOf}
        isAuthenticated onRecord={() => {}} onSettle={() => {}} />
    );
    expect(screen.getByText(/settled up/)).toBeInTheDocument();
  });

  it("lists payments with totals and records them", () => {
    const onRecord = vi.fn();
    const onSettle = vi.fn();
    render(
      <SimplifiedDebts
        settlements={[{ from: "m1", to: "m2", amount: 20 }]}
        currency="$" nameOf={nameOf} isAuthenticated onRecord={onRecord} onSettle={onSettle}
      />
    );
    expect(screen.getByText(/1 payment moves \$20\.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(onRecord).toHaveBeenCalledWith({ from: "m1", to: "m2", amount: 20 });
    fireEvent.click(screen.getByRole("button", { name: /settle/i }));
    expect(onSettle).toHaveBeenCalled();
  });

  it("hides record buttons for guests", () => {
    render(
      <SimplifiedDebts settlements={[{ from: "m1", to: "m2", amount: 20 }]}
        currency="$" nameOf={nameOf} isAuthenticated={false} onRecord={() => {}} onSettle={() => {}} />
    );
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument();
    expect(screen.getByText(/sign in to record/)).toBeInTheDocument();
  });
});

const members = [
  { _id: "m1", name: "Ann", email: "a@x.co" },
  { _id: "m2", name: "Bo", email: "b@x.co" },
];
const expenses = [
  {
    _id: "e1", description: "Dinner", amountCents: 10000, paidBy: "m1", date: "2026-09-20",
    category: "food", splitMode: "equal", isSettlement: false,
    splits: [
      { memberId: "m1", amountCents: 5000 },
      { memberId: "m2", amountCents: 5000 },
    ],
  },
  {
    _id: "e2", description: "Taxi", amountCents: 3000, paidBy: "m2", date: "2026-09-21",
    category: "transport", splitMode: "exact", isSettlement: false,
    splits: [{ memberId: "m2", amountCents: 3000 }],
  },
];

describe("DetailedSummary", () => {
  it("shows an empty state without data", () => {
    render(<DetailedSummary expenses={[]} members={members} currency="$" nameOf={nameOf} />);
    expect(screen.getByText(/no summary yet/i)).toBeInTheDocument();
    render(<DetailedSummary expenses={expenses} members={[]} currency="$" nameOf={nameOf} />);
  });

  it("breaks every expense down per member with totals", () => {
    render(<DetailedSummary expenses={expenses} members={members} currency="$" nameOf={nameOf} />);
    expect(screen.getByRole("heading", { name: "Ann" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bo" })).toBeInTheDocument();
    // $50.00 ×4: Ann subline + Ann share cell + Ann footer + Bo share cell.
    // $80.00 ×2: Bo subline + Bo footer.
    expect(screen.getAllByText("$50.00")).toHaveLength(4);
    expect(screen.getAllByText("$80.00")).toHaveLength(2);
    expect(screen.getAllByText("Equal")).toHaveLength(2); // Dinner badge in both cards
    expect(screen.getByText("Exact")).toBeInTheDocument();
    expect(screen.getAllByText("Dinner")).toHaveLength(2); // one row per member card
    expect(screen.getAllByText("Food & Drinks", { exact: false })).toHaveLength(2);
  });

  it("notes members outside every split", () => {
    render(
      <DetailedSummary expenses={expenses} members={[...members, { _id: "m3", name: "Cy" }]}
        currency="$" nameOf={nameOf} />
    );
    expect(screen.getByText(/not part of any expense/i)).toBeInTheDocument();
  });
});
