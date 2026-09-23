import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  Alert,
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  LiveDot,
  Progress,
  SectionTitle,
  Select,
  SkeletonRows,
  Stat,
  Tabs,
  TextInput,
} from "./ui";

describe("Button", () => {
  it("renders variants and sizes and forwards handlers", () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Button variant="secondary" size="sm">Back</Button>);
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    rerender(<Button variant="soft" size="lg">Soft</Button>);
    rerender(<Button variant="ghost">Ghost</Button>);
    rerender(<Button variant="dangerGhost" size="icon">X</Button>);
    expect(screen.getByRole("button", { name: "X" })).toBeInTheDocument();
  });
});

describe("Field / TextInput / Select", () => {
  it("shows hint or error, not both", () => {
    const { rerender } = render(
      <Field label="Name" hint="Shown to friends"><TextInput placeholder="n" /></Field>
    );
    expect(screen.getByText("Shown to friends")).toBeInTheDocument();
    rerender(
      <Field label="Name" hint="hidden" error="Required"><TextInput placeholder="n" /></Field>
    );
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("renders select options", () => {
    render(<Select aria-label="pick" value="a" onChange={() => {}}><option value="a">A</option></Select>);
    expect(screen.getByLabelText("pick")).toBeInTheDocument();
  });
});

describe("Card / Alert / SectionTitle", () => {
  it("renders card content and alerts", () => {
    render(<Card><Alert>Careful</Alert></Card>);
    expect(screen.getByRole("alert")).toHaveTextContent("Careful");
  });
  it("renders title, sub and action", () => {
    render(<SectionTitle title="T" sub="S" action={<button>Go</button>} />);
    expect(screen.getByText("T")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });
});

describe("Badge", () => {
  it.each(["neutral", "teal", "emerald", "amber", "rose"])("renders %s tone", (tone) => {
    const { unmount } = render(<Badge tone={tone}>Hi</Badge>);
    expect(screen.getByText("Hi")).toBeInTheDocument();
    unmount();
  });
});

describe("Avatar / AvatarStack", () => {
  it("derives initials and is deterministic", () => {
    const { container, rerender } = render(<Avatar name="Priya Sharma" />);
    expect(container.textContent).toBe("PS");
    rerender(<Avatar name="  " />);
    expect(container.textContent).toBe("?");
    rerender(<Avatar />);
    expect(container.textContent).toBe("?");
  });
  it("stacks names and collapses the rest", () => {
    render(<AvatarStack names={["A", "B", "C", "D", "E"]} max={2} />);
    expect(screen.getByText("+3")).toBeInTheDocument();
    render(<AvatarStack names={["A"]} />);
  });
});

describe("LiveDot / Stat / Progress", () => {
  it("renders live indicator and stats", () => {
    render(<LiveDot />);
    expect(screen.getByText("Live")).toBeInTheDocument();
    render(<Stat label="Total" value="$10" sub="1 expense" icon={<Icon.Plus />} tone="amber" />);
    expect(screen.getByText("Total")).toBeInTheDocument();
  });
  it("clamps progress to 0-100", () => {
    const { container } = render(
      <>
        <Progress value={1000} />
        <Progress value={-5} tone="rose" />
        <Progress value={50} tone="emerald" />
      </>
    );
    const bars = container.querySelectorAll('[style*="width"]');
    expect(bars[0].style.width).toBe("100%");
    expect(bars[1].style.width).toBe("0%");
  });
});

describe("EmptyState / SkeletonRows", () => {
  it("renders title, body and action", () => {
    render(
      <EmptyState icon={<Icon.Plus />} title="Empty" body="Nothing here" action={<button>Add</button>} />
    );
    expect(screen.getByText("Empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
  it("renders skeleton rows", () => {
    render(<SkeletonRows rows={2} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("Tabs", () => {
  const opts = [
    ["a", "Alpha", Icon.Plus, 3],
    ["b", "Beta", null],
  ];
  it("marks the active tab and notifies on change", () => {
    const onChange = vi.fn();
    render(<Tabs options={opts} value="a" onChange={onChange} />);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Alpha");
    fireEvent.click(screen.getByRole("tab", { name: /Beta/ }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
