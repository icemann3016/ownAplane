"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { addRatingsFromScan, type FoundRating, readScanIntoForm } from "./scan-actions";

/**
 * "Fill in from the scan" under a licence or medical upload (VER-9). A medical is read only when
 * the pilot presses the button that says they agree to send it; licences show a short note.
 */
export function ScanReader({
  kind,
  documentId,
  onRead,
}: {
  kind: "licence" | "medical";
  documentId: string | null;
  onRead: (values: Record<string, string>) => void;
}) {
  const t = useTranslations("pilot.scan");
  const [reading, startReading] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [ratings, setRatings] = useState<FoundRating[]>([]);

  if (!documentId) return <p className="text-xs text-muted-foreground">{t("uploadFirst")}</p>;

  function read(id: string) {
    setResult(null);
    setRatings([]);
    startReading(async () => {
      const answer = await readScanIntoForm({ kind, documentId: id, consent: kind === "medical" });
      if (!answer.ok) {
        setResult({ ok: false, message: answer.message });
        return;
      }
      onRead(answer.values);
      setRatings(answer.ratings);
      setResult({ ok: true, message: t("filled") });
    });
  }

  return (
    <div className="grid gap-3 rounded-md bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">
        {kind === "medical" ? t("medicalConsent") : t("licenceNote")}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="justify-self-start"
        disabled={reading}
        onClick={() => read(documentId)}
      >
        {reading ? (
          <Loader2Icon className="animate-spin" aria-hidden />
        ) : (
          <SparklesIcon aria-hidden />
        )}
        {kind === "medical" ? t("readMedical") : t("read")}
      </Button>
      <p role="status" className="text-sm empty:hidden">
        {reading ? t("reading") : result?.ok ? result.message : ""}
      </p>
      {result && !result.ok && (
        <Alert variant="destructive">
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
      {ratings.length > 0 && <FoundRatings documentId={documentId} ratings={ratings} />}
    </div>
  );
}

function FoundRatings({ documentId, ratings }: { documentId: string; ratings: FoundRating[] }) {
  const t = useTranslations("pilot");
  const [chosen, setChosen] = useState(() => new Set(ratings.map((_, i) => i)));
  const [saving, startSaving] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const name = (r: FoundRating) =>
    r.kind === "class"
      ? t(`classRatings.${r.code}` as "classRatings.SEP_LAND")
      : r.kind === "privilege"
        ? t(`privileges.${r.code}` as "privileges.NIGHT")
        : r.code;

  function add() {
    startSaving(async () => {
      const picked = ratings.filter((_, i) => chosen.has(i));
      const answer = await addRatingsFromScan({ documentId, ratings: picked });
      setMessage(answer.message);
    });
  }

  if (message) return <p className="text-sm">{message}</p>;
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{t("scan.ratingsFound")}</legend>
      {ratings.map((r, i) => (
        <div key={`${r.kind}:${r.code}`} className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`found-${i}`}
            className="size-4"
            checked={chosen.has(i)}
            onChange={(e) => {
              const next = new Set(chosen);
              if (e.target.checked) next.add(i);
              else next.delete(i);
              setChosen(next);
            }}
          />
          <Label htmlFor={`found-${i}`} className="font-normal">
            {name(r)} ·{" "}
            {r.expiresOn ? t("scan.validUntil", { date: r.expiresOn }) : t("scan.noDate")}
          </Label>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="justify-self-start"
        disabled={saving || chosen.size === 0}
        onClick={add}
      >
        {saving && <Loader2Icon className="animate-spin" aria-hidden />}
        {t("scan.ratingsAdd")}
      </Button>
    </fieldset>
  );
}
