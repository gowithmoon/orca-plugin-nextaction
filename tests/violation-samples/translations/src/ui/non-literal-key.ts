// Violation sample: keys that cannot be checked statically. Template literals
// count as non-literal keys, even without substitutions. A placeholder key in a
// plain string, like "Hello ${name}", is a literal and is fine.
import { t } from "../shared/l10n/l10n";

export function labels(key: string, name: string) {
  return [
    t(key),
    t(`Hello ${name}`),
    t("Hello " + name),
    t("Hello ${name}", { name }),
    t(`Translated`),
  ];
}
