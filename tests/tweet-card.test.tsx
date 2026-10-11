import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { TweetCard } from "../src/components/landing/tweet-card";

test("example cards give each fictional account a name and local portrait", () => {
  for (const [source, name, avatar] of [
    ["@productnotes", "Maya Chen", "productnotes"],
    ["@dailyhacks", "Lena Brooks", "dailyhacks"],
    ["@openrecords", "Alex Rivera", "openrecords"],
    ["@sample_account", "Deniz Kaya", "denizwrites"],
  ]) {
    const card = TweetCard({ source, synthetic: "Fictional example", children: "Post" });
    const image = card.props.children[0].props.children[0].props.children[0];
    expect(image.props.src).toBe(`/landing/avatars/${avatar}.svg`);
    expect(readFileSync(`public${image.props.src}`, "utf8")).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    const markup = renderToStaticMarkup(card);
    expect(markup).toContain(name);
    expect(markup).toContain("𝕏</span>");
    expect(markup).toContain('<span class="sr-only">Fictional example</span>');
    if (source === "@sample_account") expect(markup).toContain("@denizwrites");
  }
});
