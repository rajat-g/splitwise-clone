import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRender = vi.hoisted(() => vi.fn());
const mockCreateRoot = vi.hoisted(() => vi.fn());
const mockRegisterSW = vi.hoisted(() => vi.fn());

vi.mock("react-dom/client", () => ({
  createRoot: (...args) => mockCreateRoot(...args),
}));

vi.mock("virtual:pwa-register", () => ({
  registerSW: (...args) => mockRegisterSW(...args),
}));

beforeEach(() => {
  vi.resetModules();
  mockRender.mockReset();
  mockCreateRoot.mockReset().mockImplementation(() => ({ render: mockRender }));
  mockRegisterSW.mockReset();
  vi.unstubAllEnvs();
  document.body.innerHTML = '<div id="root"></div>';
});

async function loadMain() {
  await import("./main.jsx");
}

describe("main", () => {
  // Root is a hook-free component, so invoking it directly reveals the branch.
  it("shows the setup screen without a Convex URL", async () => {
    vi.stubEnv("VITE_CONVEX_URL", "");
    await loadMain();
    expect(mockCreateRoot).toHaveBeenCalledWith(document.getElementById("root"));
    expect(mockRegisterSW).toHaveBeenCalledTimes(1);
    expect(mockRender).toHaveBeenCalledTimes(1);
    const tree = mockRender.mock.calls[0][0];
    expect(tree.props.children.type()).toMatchObject({ type: "div" });
  });

  it("mounts the authenticated app with a Convex URL", async () => {
    vi.stubEnv("VITE_CONVEX_URL", "https://test.convex.cloud");
    await loadMain();
    expect(mockRender).toHaveBeenCalledTimes(1);
    const tree = mockRender.mock.calls[0][0];
    expect(typeof tree.props.children.type().type).toBe("function");
  });
});
