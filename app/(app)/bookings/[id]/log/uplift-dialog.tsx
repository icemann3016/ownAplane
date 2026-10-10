"use client";

import { useActionState, useState } from "react";
import { FuelIcon, PencilIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { AirportPicker, type PickerAirport } from "@/components/airport-picker";
import { DocumentField, type UploadedDocument } from "@/components/document-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { SelectField, TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fuelMismatch, type FuelType } from "@/lib/domain/log-checks";
import { type VolumeUnit } from "@/lib/domain/units";
import { type FormState, initialFormState } from "@/lib/forms";
import { useFuelUnit } from "./fuel-unit";
import { saveUplift } from "./uplift-actions";

/** Add or edit fuel or oil added during the rental, with the receipt (BKG-13, BKG-14). */
export function UpliftDialog({
  bookingId,
  logId,
  values,
  airport,
  receipt,
  fuelUnit,
  oilUnit,
  currency,
  fuelTypes,
  aircraftFuel,
  label,
}: {
  bookingId: string;
  logId: string;
  /** Field values as strings; `upliftId` when editing. */
  values: Record<string, string>;
  airport: PickerAirport | null;
  receipt: UploadedDocument | null;
  fuelUnit: VolumeUnit;
  oilUnit: string;
  currency: string;
  fuelTypes: { value: string; label: string }[];
  aircraftFuel: FuelType;
  label?: string;
}) {
  const t = useTranslations("flightLog");
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveUplift(prev, formData);
    if (result.ok) setOpen(false);
    return result;
  }, initialFormState);
  const v = { ...values, ...state.values };
  const e = state.errors ?? {};
  const [kind, setKind] = useState(v.kind === "oil" ? "oil" : "fuel");
  const [fuelType, setFuelType] = useState(v.fuelType ?? aircraftFuel);
  const mismatch = kind === "fuel" ? fuelMismatch(aircraftFuel, fuelType as FuelType) : null;
  const fuelName = (f: string) => fuelTypes.find((o) => o.value === f)?.label ?? f;
  const editing = Boolean(values.upliftId);
  const fuel = useFuelUnit("uplift", v.fuelUnit, fuelUnit);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="sm" aria-label={label}>
            <PencilIcon aria-hidden /> {t("edit")}
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <FuelIcon aria-hidden /> {t("addUplift")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t("editUplift") : t("addUplift")}</DialogTitle>
          <DialogDescription>{t("upliftHint")}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <FormMessage state={state} />
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="logId" value={logId} />
          {editing && <input type="hidden" name="upliftId" value={values.upliftId} />}
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              id="uplift-kind"
              name="kind"
              label={t("upliftKind")}
              value={kind}
              onChange={(event) => setKind(event.target.value === "oil" ? "oil" : "fuel")}
              options={[
                { value: "fuel", label: t("kinds.fuel") },
                { value: "oil", label: t("kinds.oil") },
              ]}
            />
            <SelectField
              id="uplift-paid-by"
              name="paidBy"
              label={t("paidBy")}
              defaultValue={v.paidBy ?? "pilot"}
              errors={e.paidBy}
              options={[
                { value: "pilot", label: t("payers.pilot") },
                { value: "owner", label: t("payers.owner") },
              ]}
            />
          </div>
          <AirportPicker
            name="airport"
            label={t("upliftAirport")}
            defaultAirport={airport}
            errors={e.airport}
          />
          <div className="grid grid-cols-2 gap-4">
            {kind === "fuel" && (
              <>
                {fuel.select}
                <div />
              </>
            )}
            <TextField
              id="uplift-quantity"
              name="quantity"
              inputMode="decimal"
              label={t("quantity", { unit: kind === "oil" ? oilUnit : fuel.label })}
              defaultValue={v.quantity}
              errors={e.quantity}
              required
            />
            {kind === "fuel" ? (
              <SelectField
                id="uplift-fuel-type"
                name="fuelType"
                label={t("fuelType")}
                value={fuelType}
                onChange={(event) => setFuelType(event.target.value)}
                options={fuelTypes}
              />
            ) : (
              <TextField
                id="uplift-oil-grade"
                name="oilGrade"
                label={t("oilGrade")}
                placeholder="W100+"
                maxLength={40}
                defaultValue={v.oilGrade}
                errors={e.oilGrade}
              />
            )}
          </div>
          {mismatch && (
            <p className="text-sm font-medium text-destructive">
              {t(`wrongFuel.${mismatch}Typed`, {
                fuel: fuelName(fuelType),
                expected: fuelName(aircraftFuel),
              })}
            </p>
          )}
          <TextField
            id="uplift-price"
            name="price"
            inputMode="decimal"
            label={t("price", { currency })}
            hint={t("priceHint")}
            defaultValue={v.price}
            errors={e.price}
          />
          <DocumentField
            name="receiptId"
            label={t("receipt")}
            initial={receipt}
            errors={e.receiptId}
          />
          <SubmitButton className="justify-self-start" pendingText={t("saving")}>
            {t("saveUplift")}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
