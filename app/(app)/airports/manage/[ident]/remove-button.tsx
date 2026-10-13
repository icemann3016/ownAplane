import { SubmitButton } from "@/components/forms/submit-button";
import type { ProfileItem } from "@/lib/airport-profile/ops";
import { removeItemAction } from "./profile-actions";

/** Remove one closure, runway, frequency or fee (managers). */
export function RemoveButton({
  ident,
  item,
  id,
  label,
  text,
}: {
  ident: string;
  item: ProfileItem;
  id: string;
  /** Accessible name, e.g. "Remove runway 09/27". */
  label: string;
  text: string;
}) {
  return (
    <form action={removeItemAction}>
      <input type="hidden" name="ident" value={ident} />
      <input type="hidden" name="item" value={item} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" size="sm" aria-label={label}>
        {text}
      </SubmitButton>
    </form>
  );
}
