import { QUICK_RULES, STANDARD_RULES, type RuleSet } from "../domain/rules";
import type { Language } from "../i18n/language";
import { formatMessage, messages } from "../i18n";
import { PanelHost } from "./PanelHost";

export function HelpPanel({ language, onClose, onTutorial, rules = QUICK_RULES }: { language: Language; onClose: () => void; onTutorial?: () => void; rules?: RuleSet }) {
  const copy = messages(language).help;
  const values = { cash: rules.startingCash, bonus: rules.passStartBonus, quick: QUICK_RULES.roundLimit, standard: STANDARD_RULES.roundLimit };
  return <PanelHost title={copy.title} onClose={onClose}>
    <button onClick={onClose}>{copy.close}</button>
    {Object.values(copy.sections).map((section, index) => <section key={index}><h3>{section.title}</h3><p>{formatMessage(section.body, values)}</p></section>)}
    {onTutorial && <button onClick={onTutorial}>{messages(language).tutorial.review}</button>}
  </PanelHost>;
}
