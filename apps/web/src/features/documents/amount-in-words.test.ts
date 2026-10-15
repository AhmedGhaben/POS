import { describe, expect, it } from "vitest";
import { AO, amountInWords, integerInWords } from "@pos/shared";

const kz = (n: number | string) => amountInWords(n, AO.currencyWords);

describe("amounts in words (Portuguese)", () => {
  it("small numbers, tens and hundreds", () => {
    expect(integerInWords(0)).toBe("zero");
    expect(integerInWords(16)).toBe("dezasseis");
    expect(integerInWords(21)).toBe("vinte e um");
    expect(integerInWords(100)).toBe("cem");
    expect(integerInWords(101)).toBe("cento e um");
    expect(integerInWords(999)).toBe("novecentos e noventa e nove");
  });

  it("thousands and millions, with 'e' before a last group under 100 or a round hundred", () => {
    expect(integerInWords(1000)).toBe("mil");
    expect(integerInWords(1200)).toBe("mil e duzentos");
    expect(integerInWords(1250)).toBe("mil duzentos e cinquenta");
    expect(integerInWords(2001)).toBe("dois mil e um");
    expect(integerInWords(245000)).toBe("duzentos e quarenta e cinco mil");
    expect(integerInWords(1_500_000)).toBe("um milhão e quinhentos mil");
    expect(integerInWords(2_345_678)).toBe("dois milhões trezentos e quarenta e cinco mil seiscentos e setenta e oito");
  });

  it("kwanzas and cêntimos, singular and plural", () => {
    expect(kz(1)).toBe("um kwanza");
    expect(kz(0)).toBe("zero kwanzas");
    expect(kz("1250.25")).toBe("mil duzentos e cinquenta kwanzas e vinte e cinco cêntimos");
    expect(kz(1.01)).toBe("um kwanza e um cêntimo");
    expect(kz(0.5)).toBe("cinquenta cêntimos");
    expect(kz(1_000_000)).toBe("um milhão de kwanzas");
    expect(kz(245_000)).toBe("duzentos e quarenta e cinco mil kwanzas");
  });
});
