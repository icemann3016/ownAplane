import Link from "next/link";
import { SparklesIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** A Pilot Plus page for someone without it: what it does, and where to get it. */
export async function PlusGate({ title, text }: { title: string; text: string }) {
  const t = await getTranslations("billing");
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="flex items-center gap-2">
          <SparklesIcon className="size-5 text-primary" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{text}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p>{t("plus.included")}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/account/billing#plans">{t("plus.get")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/pricing#compare">{t("plus.compare")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
