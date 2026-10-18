import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import i18n from "@/i18n";
import { DeviceRoleQuestion } from "@/features/shifts/components/DeviceRoleQuestion";
import { defaultDeviceRole, deviceRole, useDeviceRoleStore } from "./device-role";

describe("what this device is for", () => {
  beforeEach(() => useDeviceRoleStore.setState({ role: null }));

  it("until someone chooses: the Windows app is a till; a browser hasn't been told (it asks)", () => {
    expect(defaultDeviceRole(true)).toBe("TILL");
    expect(defaultDeviceRole(false)).toBeNull();
    // These tests run outside the Windows app.
    expect(deviceRole()).toBeNull();
  });

  it("the answer is saved and wins over the default", () => {
    useDeviceRoleStore.getState().setRole("TILL");
    expect(deviceRole()).toBe("TILL");
    useDeviceRoleStore.getState().setRole("BACK_OFFICE");
    expect(deviceRole()).toBe("BACK_OFFICE");
  });
});

describe("the question on a browser's POS screen", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("pt-PT");
  });

  it("an owner or manager is asked once: till (sells) or back office", () => {
    const html = renderToStaticMarkup(<DeviceRoleQuestion canChoose />);
    expect(html).toContain("Este dispositivo é uma caixa (vende) ou back office?");
    expect(html).toContain("Caixa (vende)");
    expect(html).toContain("Back office");
  });

  it("a cashier can't answer: they're told to ask a manager", () => {
    const html = renderToStaticMarkup(<DeviceRoleQuestion canChoose={false} />);
    expect(html).toContain("Peça a um gerente para configurar este dispositivo como caixa");
    expect(html).not.toContain("Caixa (vende)");
  });
});
