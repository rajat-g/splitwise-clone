import { describe, expect, it, vi } from "vitest";
import { cloneElement } from "react";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // jsdom has no layout: give charts a fixed size so ticks and cells render.
    ResponsiveContainer: ({ children }) => <>{cloneElement(children, { width: 600, height: 400 })}</>,
  };
});

import { render, screen } from "@testing-library/react";
import Insights, { ChartTip, shortMoney, truncateName } from "./Insights";

const displayOf = (m) => m?.name || "Unknown";
const members = [
  { _id: "m1", name: "Ann" },
  { _id: "m2", name: "Bo" },
];
const expenses = [
  {
    _id: "e1", description: "Dinner", amountCents: 10000, paidBy: "m1", date: "2026-09-10",
    category: "food", isSettlement: false,
    splits: [
      { memberId: "m1", amountCents: 5000 },
      { memberId: "m2", amountCents: 5000 },
    ],
  },
  {
    _id: "e2", description: "Groceries", amountCents: 4000, paidBy: "m2", date: "2026-10-02",
    category: "groceries", isSettlement: false,
    splits: [
      { memberId: "m1", amountCents: 2000 },
      { memberId: "m2", amountCents: 2000 },
    ],
  },
  {
    _id: "e3", description: "Payment", amountCents: 5000, paidBy: "m1", date: "2026-10-03",
    isSettlement: true, splits: [{ memberId: "m2", amountCents: 5000 }],
  },
];

describe("Insights", () => {
  it("shows an empty state without expenses", () => {
    render(<Insights expenses={[]} members={members} currency="$" displayOf={displayOf} />);
    expect(screen.getByText(/no insights yet/i)).toBeInTheDocument();
  });

  it("summarizes top category, biggest, average and top payer", () => {
    render(<Insights expenses={expenses} members={members} currency="$" displayOf={displayOf} />);
    expect(screen.getAllByText("Food & Drinks")).toHaveLength(2); // stat + ranked row
    expect(screen.getAllByText("$100.00")).toHaveLength(2); // biggest stat + category row
    expect(screen.getByText("$70.00")).toBeInTheDocument();
    expect(screen.getByText("Top payer")).toBeInTheDocument();
    expect(screen.getAllByText("Ann").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Groceries")).toBeInTheDocument();
  });

  it("ignores settlements everywhere", () => {
    render(<Insights expenses={expenses} members={members} currency="$" displayOf={displayOf} />);
    expect(screen.queryByText("Payment")).not.toBeInTheDocument();
  });

  it("renders charts with axes when sized", () => {
    const { container } = render(
      <Insights expenses={expenses} members={members} currency="$" displayOf={displayOf} />
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.textContent).toMatch(/Sep|Oct/);
  });

  it("notes single-month histories and compacts large ticks", () => {
    const single = [expenses[0]];
    const r1 = render(<Insights expenses={single} members={members} currency="$" displayOf={displayOf} />);
    expect(r1.getByText(/only one month/i)).toBeInTheDocument();
    r1.unmount();

    const big = [
      { ...expenses[0], _id: "b1", amountCents: 150000, date: "2026-09-10",
        splits: [{ memberId: "m1", amountCents: 150000 }] },
      { ...expenses[1], _id: "b2", amountCents: 4000, date: "2026-10-02",
        splits: [{ memberId: "m2", amountCents: 4000 }] },
    ];
    const r2 = render(<Insights expenses={big} members={members} currency="$" displayOf={displayOf} />);
    expect(r2.container.textContent).toMatch(/\$\d+(\.\d)?k/);
  });

  it("truncates long member names on the chart axis", () => {
    expect(truncateName("Ann")).toBe("Ann");
    expect(truncateName("Alexandria Catherine")).toBe("Alexandria …");
    expect(truncateName("123456789012")).toBe("123456789012");
    expect(truncateName(42)).toBe("42");
  });
});

describe("shortMoney", () => {
  it("compacts thousands and rounds the rest", () => {
    expect(shortMoney(1500, "$")).toBe("$1.5k");
    expect(shortMoney(2000, "$")).toBe("$2k");
    expect(shortMoney(999, "$")).toBe("$999");
    expect(shortMoney(0, "€")).toBe("€0");
    expect(shortMoney(NaN, "$")).toBe("$0");
    expect(shortMoney(-2500, "$")).toBe("$-2.5k");
  });
});

describe("ChartTip", () => {
  it("renders nothing when inactive or empty", () => {
    const { container: c1 } = render(<ChartTip active={false} payload={[]} currency="$" />);
    expect(c1).toBeEmptyDOMElement();
    const { container: c2 } = render(<ChartTip active payload={[]} currency="$" />);
    expect(c2).toBeEmptyDOMElement();
  });

  it("renders rows with and without a title", () => {
    const payload = [
      { name: "paid", value: 30, color: "#10b981", dataKey: "paid" },
      { name: "share", value: 20, fill: "#f59e0b", payload: {} },
    ];
    const r1 = render(<ChartTip active payload={payload} label="Ann" currency="$" />);
    expect(r1.getByText("Ann")).toBeInTheDocument();
    expect(r1.getByText("$30.00")).toBeInTheDocument();
    r1.unmount();
    const r2 = render(<ChartTip active payload={payload} label="" currency="$" />);
    expect(r2.getByText("$20.00")).toBeInTheDocument();
  });
});
