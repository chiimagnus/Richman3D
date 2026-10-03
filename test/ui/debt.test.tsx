import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameSession } from "../../src/app/GameSession";
import { debtView } from "../../src/ui/viewModel";
import { DebtPanel } from "../../src/ui/DebtPanel";
import { PropertyOperations } from "../../src/ui/AssetPanel";
import { eventText } from "../../src/ui/eventText";
import { messages, formatCash } from "../../src/i18n";
import { debtMatch, rentDebtMatch } from "../fixtures/debt-match";

it.each(["en", "zh-CN"] as const)("%s renders one non-closable debt surface and only legal liquidation operations", (language) => {
  const game = debtMatch();
  const session = new GameSession(game);
  session.bind({ sync() {}, stop() {}, async present() {} });
  const before = game.snapshot;
  const view = session.getSnapshot();
  const model = debtView(view)!;
  const onCommand = vi.fn();
  const html = renderToStaticMarkup(<DebtPanel model={model} snapshot={before} language={language} onCommand={onCommand} onPause={() => {}} />);
  const copy = messages(language);
  expect(html.match(/<dialog/g)).toHaveLength(1);
  expect(html).toContain(copy.debt.title);
  expect(html).toContain(copy.debt.solvent);
  expect(html).not.toContain(copy.debt.bankrupt);
  expect(html).not.toContain(copy.assets.close);
  expect(html).toContain('name="debt-property"');
  expect(html.match(/<option/g)).toHaveLength(4);
  expect(html).not.toContain(copy.liquidity.choices.upgrade);
  expect(html).not.toContain(copy.liquidity.choices.redeem);
  expect(JSON.stringify(model)).not.toMatch(/random|draws|statistics|history/);
  expect(model.management!.properties["neon-avenue"]!.mortgage).toMatchObject({ proceeds: 90, payment: 120, remainingCash: 0, command: { expectedRevision: before.revision } });
  const options = model.management!.properties["neon-avenue"]!;
  const mortgage = renderToStaticMarkup(<PropertyOperations options={options} propertyId="neon-avenue" language={language} onCommand={onCommand} kinds={["mortgage"]} />);
  expect(mortgage).toContain(copy.debt.autoPayment);
  expect(mortgage).toContain(formatCash(language, 120));
  expect(mortgage).toContain(formatCash(language, 0));
  for (const blocked of [{ ...view, mode: "paused" as const }, { ...view, save: { kind: "saving" as const } }, { ...view, presenting: true }, { ...view, viewPlayerId: null }]) {
    const blockedModel = debtView(blocked)!;
    expect(blockedModel.bankruptcy).toBeNull();
    if (blockedModel.management) for (const property of Object.values(blockedModel.management.properties)) for (const option of Object.values(property)) expect(option.command).toBeNull();
  }
  expect(onCommand).not.toHaveBeenCalled();
  expect(game.snapshot).toBe(before);
  session.dispose();
});

it.each(["en", "zh-CN"] as const)("%s offers a single explicit bankruptcy action only for actual insolvency", (language) => {
  const game = rentDebtMatch(30, true);
  const session = new GameSession(game);
  session.bind({ sync() {}, stop() {}, async present() {} });
  const model = debtView(session.getSnapshot())!;
  expect(model.bankruptcy?.kind).toBe("bankrupt");
  const html = renderToStaticMarkup(<DebtPanel model={model} snapshot={game.snapshot} language={language} onCommand={() => {}} onPause={() => {}} />);
  expect(html).toContain(messages(language).debt.insolvent);
  expect(html).toContain(messages(language).debt.bankrupt);
  expect(html).not.toContain(messages(language).debt.solvent);
  expect(html).not.toContain(messages(language).debt.automatic);
  expect(html).not.toContain('<option');
  const blocked = debtView({ ...session.getSnapshot(), save: { kind: "saving" } })!;
  expect(blocked.insolvent).toBe(true);
  expect(blocked.bankruptcy).toBeNull();
  const saving = renderToStaticMarkup(<DebtPanel model={blocked} snapshot={game.snapshot} language={language} onCommand={() => {}} onPause={() => {}} />);
  expect(saving).toContain(messages(language).debt.insolvent);
  expect(saving).not.toContain(messages(language).debt.solvent);
  expect(saving).toContain('disabled=""');
  const roll = [...game.snapshot.history].reverse().find((entry) => entry.event.kind === "rolled")!.event;
  expect(eventText(language, roll, game.snapshot)).not.toMatch(/paid|已.*支付/);
  session.dispose();
});
