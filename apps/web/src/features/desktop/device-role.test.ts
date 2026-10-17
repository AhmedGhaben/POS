import { beforeEach, describe, expect, it } from "vitest";
import { defaultDeviceRole, deviceRole, useDeviceRoleStore } from "./device-role";

describe("what this device is for", () => {
  beforeEach(() => useDeviceRoleStore.setState({ role: null }));

  it("until someone chooses: the Windows app is a till, a browser is back office", () => {
    expect(defaultDeviceRole(true)).toBe("TILL");
    expect(defaultDeviceRole(false)).toBe("BACK_OFFICE");
    // These tests run outside the Windows app.
    expect(deviceRole()).toBe("BACK_OFFICE");
  });

  it("the choice made in This device wins over the default", () => {
    useDeviceRoleStore.getState().setRole("TILL");
    expect(deviceRole()).toBe("TILL");
    useDeviceRoleStore.getState().setRole("BACK_OFFICE");
    expect(deviceRole()).toBe("BACK_OFFICE");
  });
});
