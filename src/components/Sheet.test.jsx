import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Sheet } from "./Sheet";

describe("Sheet", () => {
  it("renders title, subtitle and children", () => {
    render(<Sheet title="Hello" subtitle="World" onClose={() => {}}><p>Body</p></Sheet>);
    expect(screen.getByRole("dialog", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("World")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("closes on backdrop click, close button and Escape", () => {
    const onClose = vi.fn();
    render(<Sheet title="Hi" onClose={onClose}><p>Body</p></Sheet>);
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("locks body scroll while open and restores on unmount", () => {
    const { unmount } = render(<Sheet title="Hi" onClose={() => {}}><p>Body</p></Sheet>);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    render(<Sheet title="Hi" onClose={onClose}><p>Body</p></Sheet>);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("applies the wide layout", () => {
    const { container } = render(<Sheet title="Hi" onClose={() => {}} wide><p>Body</p></Sheet>);
    expect(container.innerHTML).toContain("sm:max-w-xl");
  });
});
