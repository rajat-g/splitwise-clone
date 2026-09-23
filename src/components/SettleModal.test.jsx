import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SettleModal from "./SettleModal";

const members = [
  { _id: "m1", name: "Ann" },
  { _id: "m2", name: "Bo" },
];
const balances = { m1: -30, m2: 30 };

describe("SettleModal", () => {
  it("rejects same-person and invalid amounts", () => {
    const onSave = vi.fn();
    render(
      <SettleModal members={members} balances={balances} currency="$" onClose={() => {}} onSave={onSave} />
    );
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/greater than 0/i);

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Received by"), { target: { value: "m1" } });
    fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/two different people/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("records a payment and cancels", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <SettleModal members={members} balances={balances} currency="$"
        initial={{ from: "m1", to: "m2", amount: 30 }} onClose={onClose} onSave={onSave} />
    );
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
    expect(onSave).toHaveBeenCalledWith({ from: "m1", to: "m2", amount: 30 });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a recording state while saving", () => {
    render(
      <SettleModal members={members} balances={balances} currency="$" saving
        onClose={() => {}} onSave={() => {}} />
    );
    expect(screen.getByRole("button", { name: /recording/i })).toBeInTheDocument();
  });

  it("defaults to the first members when nobody owes", () => {
    const onSave = vi.fn();
    render(
      <SettleModal members={members} balances={{ m1: 0, m2: 0 }} currency="$"
        onClose={() => {}} onSave={onSave} />
    );
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
    expect(onSave).toHaveBeenCalledWith({ from: "m1", to: "m2", amount: 12 });
  });
});
