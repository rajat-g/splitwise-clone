import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ExpenseModal from "./ExpenseModal";

const members = [
  { _id: "m1", name: "Ann", email: "a@x.co" },
  { _id: "m2", name: "Bo", email: "b@x.co" },
];

function fillValid() {
  fireEvent.change(screen.getByPlaceholderText(/dinner/i), { target: { value: "Dinner" } });
  fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "100" } });
}

describe("ExpenseModal", () => {
  it("validates description and amount before saving", () => {
    const onSave = vi.fn();
    render(<ExpenseModal members={members} currency="$" onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/description/i);
    expect(onSave).not.toHaveBeenCalled();

    fillValid();
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/greater than 0/i);
  });

  it("saves an equal split with category and split mode", () => {
    const onSave = vi.fn();
    render(<ExpenseModal members={members} currency="$" onClose={() => {}} onSave={onSave} />);
    fillValid();
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "food" } });
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      description: "Dinner",
      amount: 100,
      paidBy: "m1",
      category: "food",
      splitMode: "equal",
    }));
    expect(onSave.mock.calls[0][0].splits).toMatchObject({ m1: 50, m2: 50 });
  });

  it("requires exact splits to sum to the total", () => {
    const onSave = vi.fn();
    render(<ExpenseModal members={members} currency="$" onClose={() => {}} onSave={onSave} />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Exact" }));
    fireEvent.change(screen.getByLabelText("Ann amount"), { target: { value: "60" } });
    fireEvent.click(screen.getByLabelText("Ann amount"));
    fireEvent.change(screen.getByLabelText("Bo amount"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/must equal/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("validates percent and shares modes", () => {
    const onSave = vi.fn();
    render(<ExpenseModal members={members} currency="$" onClose={() => {}} onSave={onSave} />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "%" }));
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/100%/);
    fireEvent.click(screen.getByRole("button", { name: "Shares" }));
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/share/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("toggles members out of the split and cancels", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(<ExpenseModal members={members} currency="$" onClose={onClose} onSave={onSave} />);
    fillValid();
    fireEvent.click(screen.getByRole("checkbox", { name: /Bo/ }));
    fireEvent.click(screen.getByRole("button", { name: /add expense/i }));
    expect(onSave.mock.calls[0][0].splits).toMatchObject({ m1: 100 });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("edits with initial values and a saving state", () => {
    render(
      <ExpenseModal
        members={members} currency="$" saving
        initial={{ description: "Old", amount: 40, paidBy: "m2", date: "2026-09-01", splits: { m1: 20, m2: 20 } }}
        onClose={() => {}} onSave={() => {}}
      />
    );
    expect(screen.getByDisplayValue("Old")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Paid by"), { target: { value: "m1" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-09-05" } });
    expect(screen.getByDisplayValue("2026-09-05")).toBeInTheDocument();
  });

  it("requires a payer", () => {
    const onSave = vi.fn();
    render(
      <ExpenseModal members={[]} currency="$" onClose={() => {}} onSave={onSave}
        initial={{ description: "Dinner", amount: 10, paidBy: "", date: "2026-09-20", splits: { m9: 10 } }} />
    );
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/who paid/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("preserves an exact split when only renaming on edit", () => {
    const onSave = vi.fn();
    render(
      <ExpenseModal members={members} currency="$" onClose={() => {}} onSave={onSave}
        initial={{
          description: "Dinner", amount: 1000, paidBy: "m1", date: "2026-09-20",
          category: "food", splitMode: "exact", splits: { m1: 700, m2: 300 },
        }} />
    );
    expect(screen.getByRole("button", { name: "Exact" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByPlaceholderText(/dinner/i), { target: { value: "Dinner at Taj" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      description: "Dinner at Taj",
      splitMode: "exact",
      splits: { m1: 700, m2: 300 },
    }));
  });

  it("restores equal mode for even splits without a stored mode", () => {
    const onSave = vi.fn();
    render(
      <ExpenseModal members={members} currency="$" onClose={() => {}} onSave={onSave}
        initial={{
          description: "Dinner", amount: 100, paidBy: "m1", date: "2026-09-20",
          splits: { m1: 50, m2: 50 },
        }} />
    );
    expect(screen.getByRole("button", { name: "Equal" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      splitMode: "equal",
      splits: { m1: 50, m2: 50 },
    }));
  });

  it("shows a left payer as a disabled option and preserves them on save", () => {
    const onSave = vi.fn();
    render(
      <ExpenseModal members={members} currency="$" onClose={() => {}} onSave={onSave}
        initial={{
          description: "Old taxi", amount: 60, paidBy: "m9", date: "2026-01-05",
          category: "transport", splitMode: "equal", splits: { m9: 60 }, paidByName: "Dan",
        }} />
    );
    expect(screen.getByText("Dan (left)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ paidBy: "m9" }));
  });

  it("shows plain names, disambiguating only colliding display names", () => {
    const dupes = [
      { _id: "s1", name: "Sam", email: "sam-one@x.co" },
      { _id: "s2", name: "sam", email: "sam-two@x.co" },
      { _id: "s3", name: "Alex", email: "alex@x.co" },
    ];
    render(<ExpenseModal members={dupes} currency="$" onClose={() => {}} onSave={() => {}} />);
    expect(screen.getAllByText("Sam (sam-one@x.co)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("sam (sam-two@x.co)").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/alex@x\.co/)).not.toBeInTheDocument();
  });
});
