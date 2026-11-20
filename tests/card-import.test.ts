import { describe, expect, it } from "vitest";
import {
  parseCardFilename,
  parseRarityAlias,
  toTitleCase,
} from "../src/domain/cardImport.js";

describe("parseRarityAlias", () => {
  it("resolves all canonical rarities and shorthand aliases", () => {
    expect(parseRarityAlias("common")).toBe("common");
    expect(parseRarityAlias("c")).toBe("common");
    expect(parseRarityAlias("1")).toBe("common");
    expect(parseRarityAlias("★")).toBe("common");
    expect(parseRarityAlias("bintang 1")).toBe("common");

    expect(parseRarityAlias("rare")).toBe("rare");
    expect(parseRarityAlias("r")).toBe("rare");
    expect(parseRarityAlias("2")).toBe("rare");
    expect(parseRarityAlias("★★")).toBe("rare");

    expect(parseRarityAlias("super_rare")).toBe("super_rare");
    expect(parseRarityAlias("super rare")).toBe("super_rare");
    expect(parseRarityAlias("super-rare")).toBe("super_rare");
    expect(parseRarityAlias("sr")).toBe("super_rare");
    expect(parseRarityAlias("3")).toBe("super_rare");

    expect(parseRarityAlias("ultra_rare")).toBe("ultra_rare");
    expect(parseRarityAlias("ultra rare")).toBe("ultra_rare");
    expect(parseRarityAlias("ultra-rare")).toBe("ultra_rare");
    expect(parseRarityAlias("ur")).toBe("ultra_rare");
    expect(parseRarityAlias("4")).toBe("ultra_rare");

    expect(parseRarityAlias("holo")).toBe("holo");
    expect(parseRarityAlias("HOLO")).toBe("holo");
    expect(parseRarityAlias("h")).toBe("holo");
    expect(parseRarityAlias("holographic")).toBe("holo");
    expect(parseRarityAlias("ssr")).toBe("holo");
    expect(parseRarityAlias("5")).toBe("holo");
    expect(parseRarityAlias("★★★★★")).toBe("holo");
    expect(parseRarityAlias("bintang 5")).toBe("holo");
  });

  it("returns null for unknown or empty values", () => {
    expect(parseRarityAlias("")).toBeNull();
    expect(parseRarityAlias("   ")).toBeNull();
    expect(parseRarityAlias("legendary")).toBeNull();
  });
});

describe("toTitleCase", () => {
  it("normalizes separators and title-cases each word", () => {
    expect(toTitleCase("refi kaget")).toBe("Refi Kaget");
    expect(toTitleCase("REFI_KAGET-BANGET")).toBe("Refi Kaget Banget");
    expect(toTitleCase("  ahmad   yani ")).toBe("Ahmad Yani");
    expect(toTitleCase("   ")).toBe("");
  });
});

describe("parseCardFilename", () => {
  it("parses the primary example (holo) - refi kaget.jpg", () => {
    expect(parseCardFilename("(holo) - refi kaget.jpg")).toEqual({
      originalFilename: "(holo) - refi kaget.jpg",
      nama: "Refi Kaget",
      memberId: "refi-kaget",
      rarity: "holo",
      rawRarity: "holo",
      templateMatched: true,
    });
  });

  it("supports bracket variants, whitespace, and path prefixes", () => {
    expect(parseCardFilename("[SR] - budi_santoso.png")).toEqual({
      originalFilename: "[SR] - budi_santoso.png",
      nama: "Budi Santoso",
      memberId: "budi-santoso",
      rarity: "super_rare",
      rawRarity: "SR",
      templateMatched: true,
    });
    expect(parseCardFilename("C:\\fakepath\\(ultra rare)-ani wijaya.webp")).toEqual({
      originalFilename: "C:\\fakepath\\(ultra rare)-ani wijaya.webp",
      nama: "Ani Wijaya",
      memberId: "ani-wijaya",
      rarity: "ultra_rare",
      rawRarity: "ultra rare",
      templateMatched: true,
    });
    expect(parseCardFilename("cards/(r) joko.jpeg")).toEqual({
      originalFilename: "cards/(r) joko.jpeg",
      nama: "Joko",
      memberId: "joko",
      rarity: "rare",
      rawRarity: "r",
      templateMatched: true,
    });
  });

  it("falls back gracefully when template is missing or rarity is unknown", () => {
    expect(parseCardFilename("refi_kaget.jpg")).toEqual({
      originalFilename: "refi_kaget.jpg",
      nama: "Refi Kaget",
      memberId: "refi-kaget",
      rarity: null,
      rawRarity: null,
      templateMatched: false,
    });
    expect(parseCardFilename("(mythic) - refi kaget.jpg")).toEqual({
      originalFilename: "(mythic) - refi kaget.jpg",
      nama: "Refi Kaget",
      memberId: "refi-kaget",
      rarity: null,
      rawRarity: "mythic",
      templateMatched: false,
    });
  });
});
